#!/usr/bin/env node

/**
 * Non-destructive, checkout-scoped single-writer lease for SwissKnife.
 *
 * The lease is a directory because directory rename is an atomic
 * create-if-absent operation on the filesystems used by supervisor workers.
 * A lease is never expired by age.  It is reclaimable only when the recorded
 * process identity can be compared with the current OS process table.
 */

import {
  constants as fsConstants,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { constants as osConstants, hostname, platform } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const CONTRACT_VERSION = 1;
export const NAMESPACE_NAME = "swissknife-supervisor-checkout-lease-v1";
export const LEASE_DIRECTORY_NAME = "swissknife-checkout-lease-v1";
export const OWNER_FILE_NAME = "owner.json";
const RECLAIM_CLAIM_NAME = "reclaim-claim.json";
export const REQUIRED_DIRTY_ATTEMPTS = "0";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_CHECKOUT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const DEFAULT_INVENTORY = path.join(
  DEFAULT_CHECKOUT,
  "docs",
  "supervisor-lane-inventory.json",
);
const HEARTBEAT_INTERVAL_MS = 30_000;
const EXIT_USAGE = 64;
const EXIT_REFUSED = 73;
const EXIT_CONTRACT = 78;

class LeaseError extends Error {
  constructor(
    message,
    { code = "lease_error", exitCode = EXIT_REFUSED, details = {} } = {},
  ) {
    super(message);
    this.name = "LeaseError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

function isMissing(error) {
  return error?.code === "ENOENT" || error?.code === "ESRCH";
}

function isDestinationExists(error) {
  return ["EEXIST", "ENOTEMPTY", "EACCES", "EPERM"].includes(error?.code);
}

async function readJson(file) {
  const source = await readFile(file, "utf8");
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new LeaseError(`Invalid JSON in ${file}: ${error.message}`, {
      code: "invalid_json",
      exitCode: EXIT_CONTRACT,
      details: { file },
    });
  }
}

async function atomicWriteJson(file, value) {
  const directory = path.dirname(file);
  // The lease directory is itself the atomic ownership primitive.  Never
  // recreate it from a heartbeat: release may already have moved it aside, or
  // a successor may have acquired the canonical name.
  await stat(directory);
  const temporary = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const handle = await open(
    temporary,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
    0o600,
  );
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, file);
}

function gitOutput(checkout, args) {
  try {
    return execFileSync("git", ["-C", checkout, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    throw new LeaseError(
      `Cannot resolve the SwissKnife Git checkout at ${checkout}`,
      {
        code: "not_git_checkout",
        exitCode: EXIT_CONTRACT,
        details: {
          checkout,
          gitError: error.stderr?.toString().trim() || error.message,
        },
      },
    );
  }
}

export async function resolveCheckout(checkout = DEFAULT_CHECKOUT) {
  if (platform() !== "linux") {
    throw new LeaseError(
      "SwissKnife checkout lease v1 requires Linux procfs process identity verification",
      { code: "unsupported_platform", exitCode: EXIT_CONTRACT },
    );
  }
  const canonicalPath = await realpath(path.resolve(checkout));
  const repositoryRoot = await realpath(
    gitOutput(canonicalPath, ["rev-parse", "--show-toplevel"]),
  );
  if (repositoryRoot !== canonicalPath) {
    throw new LeaseError(
      `--checkout must name the SwissKnife repository root; got ${canonicalPath}`,
      {
        code: "checkout_not_repository_root",
        exitCode: EXIT_CONTRACT,
        details: { checkout: canonicalPath, repositoryRoot },
      },
    );
  }
  const gitDirectoryRaw = gitOutput(canonicalPath, [
    "rev-parse",
    "--absolute-git-dir",
  ]);
  const gitDirectory = await realpath(gitDirectoryRaw);
  const superprojectRaw = gitOutput(canonicalPath, [
    "rev-parse",
    "--show-superproject-working-tree",
  ]);
  if (!superprojectRaw) {
    throw new LeaseError(
      "SwissKnife must be a registered submodule so every supervisor lane can resolve the parent Git common directory",
      { code: "superproject_required", exitCode: EXIT_CONTRACT },
    );
  }
  const superproject = await realpath(superprojectRaw);
  const commonDirectoryRaw = gitOutput(superproject, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  const commonDirectory = await realpath(commonDirectoryRaw);
  const commonDirectoryStat = await stat(commonDirectory);
  const namespaceId = createHash("sha256")
    .update(NAMESPACE_NAME)
    .update("\0")
    .update(commonDirectory)
    .update("\0")
    .update(`${commonDirectoryStat.dev}:${commonDirectoryStat.ino}`)
    .digest("hex");
  return {
    checkout: canonicalPath,
    gitDirectory,
    superproject,
    commonDirectory,
    leaseDirectory: path.join(commonDirectory, LEASE_DIRECTORY_NAME),
    namespaceId,
  };
}

function parseLinuxStat(source) {
  const commandEnd = source.lastIndexOf(") ");
  if (commandEnd < 0) {
    throw new Error("unexpected /proc stat format");
  }
  const fieldsFromState = source
    .slice(commandEnd + 2)
    .trim()
    .split(/\s+/);
  // fieldsFromState[0] is field 3 (state), so field 22 (starttime) is index 19.
  const startTicks = fieldsFromState[19];
  if (!/^\d+$/.test(startTicks || "")) {
    throw new Error("missing process start ticks");
  }
  return startTicks;
}

function parseLinuxProcessGroup(source) {
  const commandEnd = source.lastIndexOf(") ");
  if (commandEnd < 0) throw new Error("unexpected /proc stat format");
  const fieldsFromState = source
    .slice(commandEnd + 2)
    .trim()
    .split(/\s+/);
  const processGroup = Number(fieldsFromState[2]); // field 5, after state and PPID
  if (!Number.isSafeInteger(processGroup) || processGroup < 0)
    throw new Error("missing process group");
  return processGroup;
}

async function linuxProcessIdentity(pid) {
  const proc = `/proc/${pid}`;
  let procStat;
  try {
    procStat = await readFile(path.join(proc, "stat"), "utf8");
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  let identityParts;
  try {
    identityParts = await Promise.all([
      readFile("/proc/sys/kernel/random/boot_id", "utf8"),
      readFile(path.join(proc, "cmdline")),
      readlink(path.join(proc, "exe")).catch((error) =>
        isMissing(error) ? null : Promise.reject(error),
      ),
      readlink(path.join(proc, "ns", "pid")),
      lstat(proc),
    ]);
  } catch (error) {
    // The process may exit after its stat was read.  ENOENT across that window
    // is positive absence, not an unverifiable permissions/format failure.
    if (isMissing(error)) return null;
    throw error;
  }
  const [bootId, commandLineBuffer, executable, pidNamespace, procMetadata] =
    identityParts;
  return {
    method: "linux-procfs-starttime-v1",
    bootId: bootId.trim(),
    startTicks: parseLinuxStat(procStat),
    pidNamespace,
    uid: procMetadata.uid,
    executable,
    command: commandLineBuffer.toString("utf8").split("\0").filter(Boolean),
  };
}

async function psProcessIdentity(pid) {
  let output;
  try {
    output = execFileSync(
      "ps",
      ["-p", String(pid), "-o", "lstart=", "-o", "uid=", "-o", "command="],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();
  } catch (error) {
    if (error.status === 1) return null;
    throw error;
  }
  if (!output) return null;
  const match = output.match(/^(.{24})\s+(\d+)\s+(.*)$/s);
  if (!match) throw new Error("unexpected ps identity format");
  return {
    method: "posix-ps-lstart-v1",
    started: match[1].trim(),
    uid: Number(match[2]),
    executable: null,
    command: [match[3]],
  };
}

export async function readProcessIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new LeaseError(`Invalid lease PID: ${pid}`, {
      code: "invalid_owner_pid",
      exitCode: EXIT_CONTRACT,
    });
  }
  try {
    return platform() === "linux"
      ? await linuxProcessIdentity(pid)
      : await psProcessIdentity(pid);
  } catch (error) {
    if (error instanceof LeaseError) throw error;
    throw new LeaseError(
      `Process identity for PID ${pid} cannot be verified: ${error.message}`,
      {
        code: "process_identity_unverifiable",
        details: { pid, osError: error.code || null },
      },
    );
  }
}

function validateRecordedOwner(owner) {
  const problems = [];
  if (owner?.schemaVersion !== CONTRACT_VERSION) problems.push("schemaVersion");
  if (owner?.namespace?.name !== NAMESPACE_NAME)
    problems.push("namespace.name");
  if (!owner?.namespace?.id || typeof owner.namespace.id !== "string")
    problems.push("namespace.id");
  if (
    !owner?.namespace?.commonDirectory ||
    typeof owner.namespace.commonDirectory !== "string"
  ) {
    problems.push("namespace.commonDirectory");
  }
  if (!owner?.leaseId || typeof owner.leaseId !== "string")
    problems.push("leaseId");
  if (!Number.isSafeInteger(owner?.owner?.pid) || owner.owner.pid <= 0)
    problems.push("owner.pid");
  if (!owner?.owner?.hostname || typeof owner.owner.hostname !== "string")
    problems.push("owner.hostname");
  if (!owner?.owner?.processIdentity?.method)
    problems.push("owner.processIdentity");
  if (owner?.owner?.processIdentity?.method === "linux-procfs-starttime-v1") {
    for (const key of ["bootId", "startTicks", "pidNamespace"]) {
      if (!owner.owner.processIdentity[key])
        problems.push(`owner.processIdentity.${key}`);
    }
  }
  if (!owner?.lane?.id || typeof owner.lane.id !== "string")
    problems.push("lane.id");
  if (!owner?.lane?.board || typeof owner.lane.board !== "string")
    problems.push("lane.board");
  if (problems.length) {
    throw new LeaseError(
      `Lease owner metadata is incomplete (${problems.join(", ")}); automatic reclamation is forbidden`,
      {
        code: "owner_metadata_unverifiable",
        details: { missingOrInvalid: problems },
      },
    );
  }
}

async function compareProcessIdentity(recorded, pid) {
  const current = await readProcessIdentity(pid);
  if (current === null)
    return {
      state: "stale_verified",
      reason: "pid_absent",
      currentIdentity: null,
    };
  if (recorded.method !== current.method) {
    return {
      state: "unverifiable",
      reason: "identity_method_changed",
      currentIdentity: current,
    };
  }
  if (recorded.method === "linux-procfs-starttime-v1") {
    if (recorded.bootId !== current.bootId) {
      return {
        state: "stale_verified",
        reason: "boot_identity_changed",
        currentIdentity: current,
      };
    }
    if (recorded.pidNamespace !== current.pidNamespace) {
      return {
        // A different PID namespace can expose the same numeric PID while the
        // recorded process remains alive outside our current /proc view.  This
        // is identity verification, but it is not proof of process death.
        state: "unverifiable",
        reason: "pid_namespace_changed",
        currentIdentity: current,
      };
    }
    if (recorded.startTicks !== current.startTicks) {
      return {
        state: "stale_verified",
        reason: "pid_reused",
        currentIdentity: current,
      };
    }
    if (recorded.uid !== current.uid) {
      return {
        state: "unverifiable",
        reason: "uid_changed",
        currentIdentity: current,
      };
    }
  } else if (
    recorded.started !== current.started ||
    recorded.uid !== current.uid
  ) {
    return {
      state: "stale_verified",
      reason: "pid_identity_changed",
      currentIdentity: current,
    };
  }
  return {
    state: "active",
    reason: "process_identity_matches",
    currentIdentity: current,
  };
}

async function findLinuxProcessGroupMember(processGroupId, recordedIdentity) {
  if (
    platform() !== "linux" ||
    !Number.isSafeInteger(processGroupId) ||
    processGroupId <= 0
  )
    return null;
  let entries;
  try {
    entries = await readdir("/proc");
  } catch (error) {
    throw new LeaseError(
      `Cannot verify protected process group ${processGroupId}: ${error.message}`,
      {
        code: "process_group_unverifiable",
      },
    );
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    try {
      const procStat = await readFile(`/proc/${pid}/stat`, "utf8");
      if (parseLinuxProcessGroup(procStat) !== processGroupId) continue;
      const identity = await readProcessIdentity(pid);
      if (
        identity &&
        identity.bootId === recordedIdentity.bootId &&
        identity.pidNamespace === recordedIdentity.pidNamespace
      ) {
        return { pid, identity };
      }
    } catch (error) {
      if (!isMissing(error)) {
        throw new LeaseError(
          `Protected process group ${processGroupId} cannot be verified: ${error.message}`,
          {
            code: "process_group_unverifiable",
          },
        );
      }
    }
  }
  return null;
}

export async function verifyOwnerIdentity(owner) {
  validateRecordedOwner(owner);
  if (owner.owner.hostname !== hostname()) {
    return {
      state: "unverifiable",
      reason: "different_host",
      detail: `recorded host ${owner.owner.hostname}; current host ${hostname()}`,
    };
  }
  const wrapper = await compareProcessIdentity(
    owner.owner.processIdentity,
    owner.owner.pid,
  );
  if (wrapper.state === "active" || wrapper.state === "unverifiable")
    return wrapper;
  if (owner.childPid && owner.childProcessIdentity) {
    const child = await compareProcessIdentity(
      owner.childProcessIdentity,
      owner.childPid,
    );
    if (child.state === "active") {
      return {
        ...child,
        reason: "protected_child_identity_matches",
        wrapperIdentity: wrapper,
      };
    }
    if (child.state === "unverifiable") {
      return {
        ...child,
        reason: `protected_child_${child.reason}`,
        wrapperIdentity: wrapper,
      };
    }
    if (owner.childProcessGroupId) {
      const groupMember = await findLinuxProcessGroupMember(
        owner.childProcessGroupId,
        owner.childProcessIdentity,
      );
      if (groupMember) {
        return {
          state: "active",
          reason: "protected_process_group_member_alive",
          currentIdentity: groupMember.identity,
          currentPid: groupMember.pid,
          wrapperIdentity: wrapper,
          childIdentity: child,
        };
      }
    }
    return {
      state: "stale_verified",
      reason: `${wrapper.reason}_and_protected_child_${child.reason}`,
      currentIdentity: null,
      wrapperIdentity: wrapper,
      childIdentity: child,
    };
  }
  return wrapper;
}

async function readLeaseOwner(context) {
  try {
    return await readJson(path.join(context.leaseDirectory, OWNER_FILE_NAME));
  } catch (error) {
    if (isMissing(error)) {
      try {
        await lstat(context.leaseDirectory);
      } catch (directoryError) {
        if (isMissing(directoryError)) return null;
        throw directoryError;
      }
      throw new LeaseError(
        "Lease directory exists without verifiable owner metadata; refusing automatic reclamation",
        {
          code: "owner_metadata_missing",
        },
      );
    }
    throw error;
  }
}

export async function inspectLease(
  context,
  { allowStaleNamespaceMigration = false } = {},
) {
  const owner = await readLeaseOwner(context);
  if (owner === null)
    return { state: "available", reason: "no_lease", owner: null };
  validateRecordedOwner(owner);
  const namespaceMatches =
    owner.namespace.id === context.namespaceId &&
    owner.namespace.commonDirectory === context.commonDirectory;
  if (!namespaceMatches) {
    // A parent repository can be restored onto a replacement filesystem while
    // retaining its canonical Git common-directory path.  Normal inspection
    // must still fail closed, but explicit reclamation may archive that old
    // record after proving its owner is gone.  Never relax a path mismatch:
    // it could name an unrelated repository namespace.
    if (
      allowStaleNamespaceMigration &&
      owner.namespace.commonDirectory === context.commonDirectory
    ) {
      const identity = await verifyOwnerIdentity(owner);
      return {
        ...identity,
        owner,
        namespaceMigrationRequired: true,
      };
    }
    throw new LeaseError(
      "Lease namespace metadata does not match the parent repository common directory",
      {
        code: "namespace_mismatch",
        details: {
          expectedId: context.namespaceId,
          recordedId: owner.namespace.id,
          expectedCommonDirectory: context.commonDirectory,
          recordedCommonDirectory: owner.namespace.commonDirectory,
        },
      },
    );
  }
  const identity = await verifyOwnerIdentity(owner);
  return { ...identity, owner };
}

async function prepareCandidate(context, owner) {
  const parent = path.dirname(context.leaseDirectory);
  const candidate = await mkdtemp(
    path.join(parent, `.${LEASE_DIRECTORY_NAME}.candidate-${process.pid}-`),
  );
  await writeFile(
    path.join(candidate, OWNER_FILE_NAME),
    `${JSON.stringify(owner, null, 2)}\n`,
    {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    },
  );
  return candidate;
}

async function quarantineVerifiedStale(context, inspection) {
  if (inspection.state !== "stale_verified") {
    throw new LeaseError(
      "Internal safety check refused reclamation without verified stale identity",
      {
        code: "reclaim_not_verified",
      },
    );
  }
  const claimPath = path.join(context.leaseDirectory, RECLAIM_CLAIM_NAME);
  let claimHandle;
  try {
    claimHandle = await open(
      claimPath,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
      0o600,
    );
  } catch (error) {
    if (error?.code === "EEXIST" || isMissing(error)) return null;
    throw error;
  }
  try {
    await claimHandle.writeFile(
      `${JSON.stringify(
        {
          schemaVersion: CONTRACT_VERSION,
          claimantPid: process.pid,
          expectedLeaseId: inspection.owner.leaseId,
          verifiedReason: inspection.reason,
          claimedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await claimHandle.sync();
  } finally {
    await claimHandle.close();
  }

  // Re-read after winning the create-if-absent claim.  Another reclaimer may
  // have replaced the directory between our first inspection and claim
  // creation; never rename that replacement merely because the old record was
  // stale (the critical stale-reclaim ABA race).
  const current = await inspectLease(context, {
    allowStaleNamespaceMigration: Boolean(
      inspection.namespaceMigrationRequired,
    ),
  });
  if (
    current.owner?.leaseId !== inspection.owner.leaseId ||
    current.state !== "stale_verified"
  ) {
    await rm(claimPath, { force: true });
    if (current.state === "active") {
      throw new LeaseError(
        `Lease became active under lane ${current.owner.lane.id}; reclamation was cancelled`,
        {
          code: "reclaim_owner_changed",
          details: { owner: current.owner },
        },
      );
    }
    return null;
  }

  const quarantine = `${context.leaseDirectory}.reclaimed-${process.pid}-${randomUUID()}`;
  try {
    await rename(context.leaseDirectory, quarantine);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  return quarantine;
}

export async function acquireLease(context, lane, command = []) {
  const identity = await readProcessIdentity(process.pid);
  if (!identity)
    throw new LeaseError(
      "Cannot establish identity for the lease-holder process",
    );
  const acquiredAt = new Date().toISOString();
  const owner = {
    schemaVersion: CONTRACT_VERSION,
    leaseId: randomUUID(),
    namespace: {
      name: NAMESPACE_NAME,
      id: context.namespaceId,
      checkout: context.checkout,
      gitDirectory: context.gitDirectory,
      superproject: context.superproject,
      commonDirectory: context.commonDirectory,
    },
    owner: {
      pid: process.pid,
      hostname: hostname(),
      processIdentity: identity,
    },
    lane: {
      id: lane.id,
      board: lane.board,
      taskPrefix: lane.taskPrefix,
      statePrefix: lane.statePrefix,
      stateDirectory: lane.stateDirectory,
    },
    command,
    acquiredAt,
    heartbeatAt: acquiredAt,
    childPid: null,
    childProcessIdentity: null,
    childProcessGroupId: null,
  };

  let candidate = await prepareCandidate(context, owner);
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      let destinationExists = false;
      try {
        await lstat(context.leaseDirectory);
        destinationExists = true;
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      if (!destinationExists) {
        try {
          await rename(candidate, context.leaseDirectory);
          candidate = null;
          // Preserve verified-stale owner metadata as an audit receipt.  The
          // uniquely named sibling cannot contend with the canonical directory.
          return owner;
        } catch (error) {
          if (!isDestinationExists(error)) throw error;
        }
      }

      const inspection = await inspectLease(context);
      if (inspection.state === "active") {
        throw new LeaseError(
          `SwissKnife checkout is owned by lane ${inspection.owner.lane.id} ` +
            `(PID ${inspection.owner.owner.pid}, board ${inspection.owner.lane.board})`,
          { code: "lease_held", details: { owner: inspection.owner } },
        );
      }
      if (inspection.state === "unverifiable") {
        throw new LeaseError(
          `Existing lease owner cannot be verified (${inspection.reason}); implementation is paused`,
          {
            code: "owner_unverifiable",
            details: { inspection },
          },
        );
      }
      if (inspection.state === "available") continue;
      await quarantineVerifiedStale(context, inspection);
    }
    throw new LeaseError(
      "Lease acquisition lost repeated atomic races; implementation is paused",
      {
        code: "acquire_race_exhausted",
      },
    );
  } finally {
    if (candidate) await rm(candidate, { recursive: true, force: true });
  }
}

async function updateOwnedLease(context, leaseId, changes) {
  const owner = await readLeaseOwner(context);
  if (!owner || owner.leaseId !== leaseId || owner.owner.pid !== process.pid) {
    throw new LeaseError(
      "Lease ownership changed; refusing to update another owner record",
      {
        code: "ownership_changed",
      },
    );
  }
  const identity = await verifyOwnerIdentity(owner);
  if (identity.state !== "active") {
    throw new LeaseError(
      `Current lease identity no longer matches (${identity.reason})`,
      {
        code: "self_identity_mismatch",
      },
    );
  }
  const updated = { ...owner, ...changes };
  await atomicWriteJson(
    path.join(context.leaseDirectory, OWNER_FILE_NAME),
    updated,
  );
  return updated;
}

export async function releaseLease(context, leaseId) {
  const owner = await readLeaseOwner(context);
  if (!owner) return false;
  if (owner.leaseId !== leaseId || owner.owner.pid !== process.pid) {
    throw new LeaseError(
      "Refusing to release a lease owned by another process",
      {
        code: "release_not_owner",
        details: { recordedPid: owner.owner.pid, currentPid: process.pid },
      },
    );
  }
  const identity = await verifyOwnerIdentity(owner);
  if (identity.state !== "active") {
    throw new LeaseError(
      `Refusing release because owner identity verification returned ${identity.state}`,
      {
        code: "release_identity_mismatch",
        details: { identity },
      },
    );
  }
  const releaseDirectory = `${context.leaseDirectory}.release-${process.pid}-${randomUUID()}`;
  await rename(context.leaseDirectory, releaseDirectory);
  await rm(releaseDirectory, { recursive: true, force: true });
  return true;
}

function repositoryRootFromCheckout(checkout) {
  return path.dirname(checkout);
}

function optionValue(command, option) {
  const index = command.indexOf(option);
  return index >= 0 ? command[index + 1] : undefined;
}

function validateInventory(inventory) {
  const problems = [];
  if (inventory?.schemaVersion !== CONTRACT_VERSION)
    problems.push("schemaVersion must be 1");
  if (inventory?.leaseNamespace?.name !== NAMESPACE_NAME)
    problems.push(`leaseNamespace.name must be ${NAMESPACE_NAME}`);
  if (
    inventory?.leaseNamespace?.directory !==
    `$SUPERPROJECT_COMMON_GIT_DIR/${LEASE_DIRECTORY_NAME}`
  ) {
    problems.push(
      `leaseNamespace.directory must be $SUPERPROJECT_COMMON_GIT_DIR/${LEASE_DIRECTORY_NAME}`,
    );
  }
  if (!Array.isArray(inventory?.lanes) || inventory.lanes.length === 0)
    problems.push("lanes must be non-empty");
  if (
    !Array.isArray(inventory?.canonicalLaneIds) ||
    inventory.canonicalLaneIds.length === 0
  ) {
    problems.push("canonicalLaneIds must be non-empty");
  }
  const ids = new Set();
  for (const [index, lane] of (inventory?.lanes || []).entries()) {
    const label = `lanes[${index}]`;
    if (!lane?.id || ids.has(lane.id))
      problems.push(`${label}.id must be present and unique`);
    ids.add(lane?.id);
    for (const key of [
      "kind",
      "board",
      "taskPrefix",
      "statePrefix",
      "stateDirectory",
    ]) {
      if (!lane?.[key] || typeof lane[key] !== "string")
        problems.push(`${label}.${key} is required`);
    }
    if (lane?.leaseRequiredForImplementation !== true)
      problems.push(`${label}.leaseRequiredForImplementation must be true`);
    if (!["implementation-supervisor", "integration"].includes(lane?.kind))
      problems.push(
        `${label}.kind must be implementation-supervisor or integration`,
      );
    if (
      lane?.launch?.environment?.IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS !==
      REQUIRED_DIRTY_ATTEMPTS
    ) {
      problems.push(
        `${label}.launch.environment.IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS must be "0"`,
      );
    }
    const required = lane?.launch?.requiredArguments || [];
    if (lane.kind === "implementation-supervisor") {
      if (!required.includes("--no-ephemeral-worktree"))
        problems.push(`${label} must require --no-ephemeral-worktree`);
      if (!required.includes("--no-worktree-reconciliation"))
        problems.push(`${label} must require --no-worktree-reconciliation`);
    }
    if (!["exact", "prefix"].includes(lane?.launch?.commandPolicy))
      problems.push(`${label}.launch.commandPolicy must be exact or prefix`);
    if (
      lane.kind === "implementation-supervisor" &&
      lane.launch.commandPolicy !== "exact"
    )
      problems.push(`${label} implementation command policy must be exact`);
    const command = lane?.launch?.command;
    if (!Array.isArray(command)) {
      problems.push(`${label}.launch.command must be an array`);
      continue;
    }
    const separator = command.indexOf("--");
    const wrapper = separator >= 0 ? command.slice(0, separator) : command;
    const child = separator >= 0 ? command.slice(separator + 1) : [];
    if (
      wrapper[0] !== "node" ||
      wrapper[1] !== "swissknife/scripts/swissknife-checkout-lease.mjs" ||
      !wrapper.includes("--run")
    ) {
      problems.push(
        `${label}.launch.command must start with the repository lease --run wrapper`,
      );
    }
    if (optionValue(wrapper, "--lane") !== lane.id)
      problems.push(`${label}.launch.command --lane must match id`);
    if (optionValue(wrapper, "--board") !== lane.board)
      problems.push(`${label}.launch.command --board must match board`);
    if (child.length === 0)
      problems.push(`${label}.launch.command must include a foreground child`);
    for (const requiredArgument of required) {
      if (!child.includes(requiredArgument))
        problems.push(
          `${label}.launch.command child must include ${requiredArgument}`,
        );
    }
    if (lane.kind === "implementation-supervisor") {
      if (!child.includes("--implement"))
        problems.push(`${label}.launch.command child must include --implement`);
      for (const [option, expected] of [
        ["--todo-path", lane.board],
        ["--task-prefix", lane.taskPrefix],
        ["--state-prefix", lane.statePrefix],
        ["--state-dir", lane.stateDirectory],
      ]) {
        if (optionValue(child, option) !== expected)
          problems.push(
            `${label}.launch.command ${option} must match lane metadata`,
          );
      }
    }
  }
  for (const canonicalId of inventory?.canonicalLaneIds || []) {
    if (!ids.has(canonicalId))
      problems.push(`canonicalLaneIds references unknown lane ${canonicalId}`);
  }
  if (problems.length) {
    throw new LeaseError(
      `Supervisor lane inventory violates the lease contract:\n- ${problems.join("\n- ")}`,
      {
        code: "inventory_contract_invalid",
        exitCode: EXIT_CONTRACT,
        details: { problems },
      },
    );
  }
  return inventory;
}

async function loadInventory(file) {
  return validateInventory(await readJson(file));
}

function validateOwnerRegistration(inspection, inventory) {
  if (!inspection.owner) return;
  const recorded = inspection.owner.lane;
  const lane = inventory.lanes.find(
    (candidate) => candidate.id === recorded.id,
  );
  if (!lane) {
    throw new LeaseError(
      `Lease owner lane ${recorded.id} is not registered in the audited inventory`,
      {
        code: "owner_lane_unregistered",
        details: { ownerLane: recorded.id },
      },
    );
  }
  const mismatches = [];
  for (const [ownerKey, laneKey] of [
    ["board", "board"],
    ["taskPrefix", "taskPrefix"],
    ["statePrefix", "statePrefix"],
    ["stateDirectory", "stateDirectory"],
  ]) {
    if (recorded[ownerKey] !== lane[laneKey])
      mismatches.push(`${ownerKey}: ${recorded[ownerKey]} != ${lane[laneKey]}`);
  }
  if (mismatches.length) {
    throw new LeaseError(
      `Lease owner metadata does not match registered lane ${lane.id}: ${mismatches.join(", ")}`,
      {
        code: "owner_lane_metadata_mismatch",
        details: { mismatches, ownerLane: recorded, registeredLane: lane },
      },
    );
  }
}

async function resolveLane({ inventory, laneId, board, checkout }) {
  const lane = inventory.lanes.find((candidate) => candidate.id === laneId);
  if (!lane) {
    throw new LeaseError(`Unknown SwissKnife supervisor lane: ${laneId}`, {
      code: "unknown_lane",
      exitCode: EXIT_USAGE,
    });
  }
  const root = repositoryRootFromCheckout(checkout);
  const recordedBoard = await realpath(path.resolve(root, lane.board)).catch(
    () => path.resolve(root, lane.board),
  );
  const requestedBoardPath = board
    ? path.isAbsolute(board)
      ? board
      : path.resolve(root, board)
    : recordedBoard;
  const requestedBoard = await realpath(requestedBoardPath).catch(
    () => requestedBoardPath,
  );
  if (requestedBoard !== recordedBoard) {
    throw new LeaseError(
      `Lane ${lane.id} is registered for ${lane.board}, not ${board}`,
      {
        code: "board_mismatch",
        exitCode: EXIT_USAGE,
      },
    );
  }
  try {
    await stat(recordedBoard);
  } catch (error) {
    throw new LeaseError(`Registered board does not exist: ${lane.board}`, {
      code: "board_missing",
      exitCode: EXIT_CONTRACT,
    });
  }
  return lane;
}

function validateImplementationCommand(command, lane) {
  if (command.length === 0) {
    throw new LeaseError("--run requires a command after --", {
      code: "missing_command",
      exitCode: EXIT_USAGE,
    });
  }
  if (
    process.env.IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS !==
    REQUIRED_DIRTY_ATTEMPTS
  ) {
    throw new LeaseError(
      "IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS must be exactly 0 before lease acquisition",
      {
        code: "unsafe_dirty_attempts",
        exitCode: EXIT_CONTRACT,
      },
    );
  }
  const joined = command.join(" ");
  const destructiveGit = [
    /(?:^|[;&|]\s*|\s)git\b[^;&|\n]*\bcheckout\b[^;&|\n]*(?:--force|(?:^|\s)-f)(?:\s|$)/,
    /(?:^|[;&|]\s*|\s)git\b[^;&|\n]*\bswitch\b[^;&|\n]*(?:--force|(?:^|\s)-f)(?:\s|$)/,
    /(?:^|[;&|]\s*|\s)git\b[^;&|\n]*\breset\b/,
    /(?:^|[;&|]\s*|\s)git\b[^;&|\n]*\brestore\b/,
    /(?:^|[;&|]\s*|\s)git\b[^;&|\n]*\bstash\b/,
    /(?:^|[;&|]\s*|\s)git\b[^;&|\n]*\bclean\b/,
    /(?:^|[;&|]\s*|\s)git\b[^;&|\n]*\bsubmodule\s+update\b/,
    /(?:^|[;&|]\s*|\s)git\b[^;&|\n]*\bworktree\s+remove\b[^;&|\n]*(?:--force|(?:^|\s)-f)(?:\s|$)/,
  ];
  if (destructiveGit.some((pattern) => pattern.test(joined))) {
    throw new LeaseError(
      "Destructive Git recovery commands may not run under the SwissKnife lease",
      {
        code: "destructive_command_refused",
        exitCode: EXIT_CONTRACT,
      },
    );
  }
  for (const required of lane.launch.requiredArguments) {
    if (!command.includes(required)) {
      throw new LeaseError(
        `Supervisor command for lane ${lane.id} is missing required safety argument ${required}`,
        {
          code: "required_argument_missing",
          exitCode: EXIT_CONTRACT,
        },
      );
    }
  }
  const recordedSeparator = lane.launch.command.indexOf("--");
  const recordedChild = lane.launch.command.slice(recordedSeparator + 1);
  const commandMatches =
    recordedSeparator >= 0 &&
    (lane.launch.commandPolicy === "prefix"
      ? command.length >= recordedChild.length &&
        recordedChild.every((argument, index) => command[index] === argument)
      : command.length === recordedChild.length &&
        command.every((argument, index) => argument === recordedChild[index]));
  if (!commandMatches) {
    throw new LeaseError(
      `Command for lane ${lane.id} does not match its audited inventory ${lane.launch.commandPolicy} policy`,
      {
        code: "command_inventory_mismatch",
        exitCode: EXIT_CONTRACT,
        details: { expected: recordedChild, received: command },
      },
    );
  }
}

function parseArguments(argv) {
  const separator = argv.indexOf("--");
  const optionArgs = separator >= 0 ? argv.slice(0, separator) : argv;
  const command = separator >= 0 ? argv.slice(separator + 1) : [];
  const result = {
    mode: null,
    checkout: DEFAULT_CHECKOUT,
    inventory: DEFAULT_INVENTORY,
    lane: null,
    board: null,
    json: false,
    command,
  };
  const modes = new Set([
    "--check",
    "--status",
    "--run",
    "--reclaim",
    "--help",
  ]);
  for (let i = 0; i < optionArgs.length; i += 1) {
    const argument = optionArgs[i];
    if (modes.has(argument)) {
      if (result.mode && result.mode !== argument)
        throw new LeaseError("Specify exactly one command mode", {
          exitCode: EXIT_USAGE,
        });
      result.mode = argument;
    } else if (argument === "--json") {
      result.json = true;
    } else if (
      ["--checkout", "--inventory", "--lane", "--board"].includes(argument)
    ) {
      const value = optionArgs[++i];
      if (!value)
        throw new LeaseError(`${argument} requires a value`, {
          exitCode: EXIT_USAGE,
        });
      result[argument.slice(2)] = value;
    } else {
      throw new LeaseError(`Unknown argument: ${argument}`, {
        code: "unknown_argument",
        exitCode: EXIT_USAGE,
      });
    }
  }
  result.mode ||= "--help";
  return result;
}

function publicInspection(context, inspection) {
  return {
    ok: inspection.state === "available" || inspection.state === "active",
    contractVersion: CONTRACT_VERSION,
    namespace: {
      name: NAMESPACE_NAME,
      id: context.namespaceId,
      checkout: context.checkout,
      directory: context.leaseDirectory,
    },
    state: inspection.state,
    reason: inspection.reason,
    owner: inspection.owner
      ? {
          leaseId: inspection.owner.leaseId,
          pid: inspection.owner.owner.pid,
          hostname: inspection.owner.owner.hostname,
          lane: inspection.owner.lane.id,
          board: inspection.owner.lane.board,
          acquiredAt: inspection.owner.acquiredAt,
          heartbeatAt: inspection.owner.heartbeatAt,
          childPid: inspection.owner.childPid,
        }
      : null,
  };
}

function printResult(result, json = false) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  const owner = result.owner
    ? `; owner=${result.owner.lane} pid=${result.owner.pid} board=${result.owner.board}`
    : "";
  process.stdout.write(
    `SwissKnife checkout lease: ${result.state} (${result.reason})${owner}\n`,
  );
}

async function runChild(context, owner, command, json) {
  const guardSource = String.raw`
const { spawn } = require('node:child_process');
const process = require('node:process');
const command = JSON.parse(process.env.SWISSKNIFE_LEASE_CHILD_COMMAND);
delete process.env.SWISSKNIFE_LEASE_CHILD_COMMAND;
process.kill(process.pid, 'SIGSTOP');
const child = spawn(command[0], command.slice(1), { stdio: 'inherit', env: process.env });
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  });
}
child.on('error', (error) => { console.error(error.message); process.exit(127); });
child.on('exit', (code, signal) => {
  if (code !== null) process.exit(code);
  const number = require('node:os').constants.signals[signal] || 0;
  process.exit(128 + number);
});
`;
  // The guard stops itself before it can launch the requested command.  We
  // publish its exact process identity, then continue it.  Thus a SIGKILL of
  // the outer lease wrapper cannot make a still-running supervisor look stale.
  const child = spawn(process.execPath, ["-e", guardSource], {
    cwd: repositoryRootFromCheckout(context.checkout),
    detached: platform() !== "win32",
    env: {
      ...process.env,
      IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS: REQUIRED_DIRTY_ATTEMPTS,
      SWISSKNIFE_CHECKOUT_LEASE_ID: owner.leaseId,
      SWISSKNIFE_CHECKOUT_LEASE_LANE: owner.lane.id,
      SWISSKNIFE_CHECKOUT_LEASE_BOARD: owner.lane.board,
      SWISSKNIFE_CHECKOUT_LEASE_OWNER_FILE: path.join(
        context.leaseDirectory,
        OWNER_FILE_NAME,
      ),
      SWISSKNIFE_LEASE_CHILD_COMMAND: JSON.stringify(command),
    },
    stdio: "inherit",
  });
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  let childIdentity = null;
  let childStopped = platform() !== "linux";
  for (let attempt = 0; attempt < 100; attempt += 1) {
    childIdentity = await readProcessIdentity(child.pid);
    if (childIdentity) {
      if (platform() !== "linux") break;
      const childStat = await readFile(`/proc/${child.pid}/stat`, "utf8");
      const state = childStat
        .slice(childStat.lastIndexOf(") ") + 2)
        .split(/\s+/)[0];
      if (state === "T" || state === "t") {
        childStopped = true;
        break;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (!childIdentity || !childStopped) {
    child.kill("SIGKILL");
    throw new LeaseError(
      "Protected child exited before its process identity could be recorded",
      {
        code: "child_identity_unavailable",
      },
    );
  }
  await updateOwnedLease(context, owner.leaseId, {
    childPid: child.pid,
    childProcessIdentity: childIdentity,
    childProcessGroupId: platform() === "linux" ? child.pid : null,
    heartbeatAt: new Date().toISOString(),
  });
  if (platform() !== "win32") child.kill("SIGCONT");
  let heartbeatUpdate = Promise.resolve();
  const heartbeat = setInterval(() => {
    heartbeatUpdate = heartbeatUpdate
      .then(() =>
        updateOwnedLease(context, owner.leaseId, {
          heartbeatAt: new Date().toISOString(),
          childPid: child.pid,
        }),
      )
      .catch((error) => {
        process.stderr.write(
          `SwissKnife lease heartbeat failed: ${error.message}\n`,
        );
      });
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  let forwardedSignal = null;
  const forward = (signal) => {
    forwardedSignal = signal;
    if (child.exitCode === null && child.signalCode === null)
      child.kill(signal);
  };
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
  const signalHandlers = new Map(
    signals.map((signal) => [signal, () => forward(signal)]),
  );
  for (const [signal, handler] of signalHandlers) process.on(signal, handler);
  let exitCode;
  let childSignal;
  try {
    ({ code: exitCode, signal: childSignal } = await new Promise((resolve) => {
      child.once("exit", (code, signal) => resolve({ code, signal }));
    }));
  } finally {
    clearInterval(heartbeat);
    for (const [signal, handler] of signalHandlers)
      process.removeListener(signal, handler);
    // A timer callback may already be updating owner.json.  Let it finish
    // before moving the lease directory so it can never recreate or overwrite
    // a successor's owner record after release.
    await heartbeatUpdate;
    await releaseLease(context, owner.leaseId);
  }
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ released: true, childExitCode: exitCode, childSignal }, null, 2)}\n`,
    );
  }
  if (exitCode !== null) return exitCode;
  const effectiveSignal = childSignal || forwardedSignal;
  return effectiveSignal
    ? 128 + (osConstants.signals[effectiveSignal] || 0)
    : 1;
}

function usage() {
  return `Usage:
  node scripts/swissknife-checkout-lease.mjs --check [--json]
  node scripts/swissknife-checkout-lease.mjs --status [--json]
  node scripts/swissknife-checkout-lease.mjs --reclaim [--json]
  IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS=0 node scripts/swissknife-checkout-lease.mjs \\
    --run --lane <lane-id> [--board <path>] -- <supervisor command>

Options:
  --checkout <path>   SwissKnife repository root (default: script repository)
  --inventory <path> Lane inventory JSON
  --json              Emit machine-readable output

--check validates every registered lane and reports lease health.  It does not
take the lease.  --reclaim removes a lease only after recorded process identity
has been verified stale.  --run holds the lease for the full child lifetime.
`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.mode === "--help") {
    process.stdout.write(usage());
    return 0;
  }
  const context = await resolveCheckout(options.checkout);
  if (!path.isAbsolute(options.inventory))
    options.inventory = path.resolve(process.cwd(), options.inventory);
  const inventory = await loadInventory(options.inventory);
  const inspection = await inspectLease(context, {
    // Namespace IDs incorporate the parent Git common-directory inode.  An
    // explicit reclaim can therefore migrate a stale record after a restore
    // replaces that directory, but all ordinary checks continue to fail
    // closed on the mismatch.
    allowStaleNamespaceMigration: options.mode === "--reclaim",
  });
  validateOwnerRegistration(inspection, inventory);

  if (options.mode === "--check" || options.mode === "--status") {
    const result = publicInspection(context, inspection);
    if (options.mode === "--check")
      result.registeredLaneCount = inventory.lanes.length;
    printResult(result, options.json);
    if (options.mode === "--check" && !result.ok) return EXIT_REFUSED;
    if (inspection.state === "unverifiable") return EXIT_REFUSED;
    return 0;
  }

  if (options.mode === "--reclaim") {
    if (inspection.state === "available") {
      printResult(publicInspection(context, inspection), options.json);
      return 0;
    }
    if (inspection.state !== "stale_verified") {
      throw new LeaseError(
        `Lease is ${inspection.state}; reclamation requires verified stale identity`,
        {
          code: "reclaim_refused",
          details: { inspection },
        },
      );
    }
    const quarantine = await quarantineVerifiedStale(context, inspection);
    if (!quarantine) {
      throw new LeaseError(
        "Another process changed or is reclaiming the lease; retry after checking identity",
        {
          code: "reclaim_race",
        },
      );
    }
    printResult(
      {
        ...publicInspection(context, {
          state: "available",
          reason: `reclaimed_after_${inspection.reason}`,
          owner: null,
        }),
        reclaimedLeaseId: inspection.owner.leaseId,
        auditDirectory: quarantine,
      },
      options.json,
    );
    return 0;
  }

  if (options.mode === "--run") {
    if (!options.lane)
      throw new LeaseError("--run requires --lane", {
        code: "missing_lane",
        exitCode: EXIT_USAGE,
      });
    const lane = await resolveLane({
      inventory,
      laneId: options.lane,
      board: options.board,
      checkout: context.checkout,
    });
    validateImplementationCommand(options.command, lane);
    const owner = await acquireLease(context, lane, options.command);
    return runChild(context, owner, options.command, options.json);
  }
  throw new LeaseError(`Unsupported mode ${options.mode}`, {
    exitCode: EXIT_USAGE,
  });
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH;
if (invokedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      const result = {
        ok: false,
        error: error.code || "unexpected_error",
        message: error.message,
        details: error.details || {},
      };
      if (process.argv.includes("--json"))
        process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
      else
        process.stderr.write(
          `SwissKnife checkout lease refused: ${error.message}\n`,
        );
      process.exitCode = error.exitCode || 1;
    });
}
