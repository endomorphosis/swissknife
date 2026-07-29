import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  NAMESPACE_NAME,
  acquireLease,
  inspectLease,
  readProcessIdentity,
  releaseLease,
  resolveCheckout,
  verifyOwnerIdentity,
} from "../../scripts/swissknife-checkout-lease.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(
  TEST_DIR,
  "../../scripts/swissknife-checkout-lease.mjs",
);
const HEARTBEAT_INTERVAL_ENV =
  "SWISSKNIFE_CHECKOUT_LEASE_HEARTBEAT_INTERVAL_MS";

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Lease Test",
      GIT_AUTHOR_EMAIL: "lease@example.invalid",
      GIT_COMMITTER_NAME: "Lease Test",
      GIT_COMMITTER_EMAIL: "lease@example.invalid",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function fixture({ childSource = "process.exit(23)" } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "swissknife-lease-test-"));
  const source = path.join(root, "source");
  const parent = path.join(root, "parent");
  await mkdir(source);
  git(source, "init", "-q");
  await writeFile(path.join(source, "README.md"), "fixture\n");
  git(source, "add", "README.md");
  git(source, "commit", "-qm", "fixture");
  await mkdir(parent);
  git(parent, "init", "-q");
  await writeFile(path.join(parent, "board.md"), "# Board\n");
  git(parent, "add", "board.md");
  git(parent, "commit", "-qm", "parent");
  git(
    parent,
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "add",
    "-q",
    source,
    "swissknife",
  );
  git(parent, "commit", "-qam", "add submodule");
  const checkout = path.join(parent, "swissknife");
  const inventoryPath = path.join(root, "inventory.json");
  const childCommand = [
    process.execPath,
    "-e",
    childSource,
    "--",
    "--todo-path",
    "board.md",
    "--state-dir",
    "tmp/test-lane/state",
    "--task-prefix",
    "## TEST-",
    "--state-prefix",
    "test_lane",
    "--implement",
    "--no-ephemeral-worktree",
    "--no-worktree-reconciliation",
  ];
  const lane = {
    id: "test-lane",
    kind: "implementation-supervisor",
    board: "board.md",
    taskPrefix: "## TEST-",
    statePrefix: "test_lane",
    stateDirectory: "tmp/test-lane/state",
    leaseRequiredForImplementation: true,
    launch: {
      commandPolicy: "exact",
      environment: { IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS: "0" },
      requiredArguments: [
        "--no-ephemeral-worktree",
        "--no-worktree-reconciliation",
      ],
      command: [
        "node",
        "swissknife/scripts/swissknife-checkout-lease.mjs",
        "--run",
        "--lane",
        "test-lane",
        "--board",
        "board.md",
        "--",
        ...childCommand,
      ],
    },
  };
  await writeFile(
    inventoryPath,
    `${JSON.stringify({
      schemaVersion: 1,
      canonicalLaneIds: ["test-lane"],
      leaseNamespace: {
        name: NAMESPACE_NAME,
        directory: "$SUPERPROJECT_COMMON_GIT_DIR/swissknife-checkout-lease-v1",
      },
      lanes: [lane],
    })}\n`,
  );
  return { root, parent, checkout, inventoryPath, lane, childCommand };
}

function longRunningChildSource({ exitOnSigterm = true } = {}) {
  return String.raw`
const fs = require('node:fs');
const marker = process.env.SWISSKNIFE_LEASE_TEST_MARKER;
process.on('SIGTERM', () => {
  fs.appendFileSync(marker, 'SIGTERM\n');
  ${exitOnSigterm ? "process.exit(0);" : ""}
});
fs.writeFileSync(marker, 'started\n');
setInterval(() => {}, 1_000);
`;
}

function spawnLeaseRun(item, extraEnvironment = {}) {
  const child = spawn(
    process.execPath,
    [
      SCRIPT,
      "--checkout",
      item.checkout,
      "--inventory",
      item.inventoryPath,
      "--run",
      "--lane",
      item.lane.id,
      "--",
      ...item.childCommand,
    ],
    {
      env: {
        ...process.env,
        IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS: "0",
        ...extraEnvironment,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const result = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      resolve({ code, signal, stdout, stderr }),
    );
  });
  return { child, result };
}

async function waitForProtectedChild(context, markerPath) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    try {
      const owner = (await inspectLease(context)).owner;
      const marker = await readFile(markerPath, "utf8");
      if (owner.childProcessGroupId && marker.includes("started")) return owner;
    } catch {
      // The lease metadata or foreground child is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for protected child");
}

async function replaceOwnerBytes(context, source) {
  const ownerPath = path.join(context.leaseDirectory, "owner.json");
  const replacementPath = `${ownerPath}.test-replacement`;
  await writeFile(replacementPath, source, { mode: 0o600 });
  await rename(replacementPath, ownerPath);
}

async function waitForProcessGroupExit(processGroupId) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      process.kill(-processGroupId, 0);
    } catch (error) {
      if (error.code === "ESRCH") return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`protected process group ${processGroupId} is still alive`);
}

function cleanUpProtectedRun(wrapper, owner) {
  if (wrapper.exitCode === null && wrapper.signalCode === null)
    wrapper.kill("SIGKILL");
  if (owner?.childProcessGroupId) {
    try {
      process.kill(-owner.childProcessGroupId, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
}

test("acquires atomically, records lane/board/PID, refuses a second writer, and releases by identity", async (t) => {
  const item = await fixture();
  t.after(() => rm(item.root, { recursive: true, force: true }));
  const context = await resolveCheckout(item.checkout);
  assert.equal(context.commonDirectory, path.join(item.parent, ".git"));

  const owner = await acquireLease(context, item.lane, [
    "node",
    "-e",
    "process.exit(0)",
  ]);
  assert.equal(owner.owner.pid, process.pid);
  assert.equal(owner.lane.board, "board.md");
  assert.equal((await inspectLease(context)).state, "active");

  await assert.rejects(
    acquireLease(context, item.lane, ["node", "-e", "process.exit(0)"]),
    (error) => error.code === "lease_held",
  );
  assert.equal(await releaseLease(context, owner.leaseId), true);
  assert.equal((await inspectLease(context)).state, "available");
});

test("staleness is proven from boot/PID start identity, never lease age", async (t) => {
  const child = spawn(
    process.execPath,
    ["-e", "setTimeout(() => {}, 10_000)"],
    { stdio: "ignore" },
  );
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  });
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  const identity = await readProcessIdentity(child.pid);
  const owner = {
    schemaVersion: 1,
    leaseId: "00000000-0000-4000-8000-000000000000",
    namespace: {
      name: NAMESPACE_NAME,
      id: "test-namespace",
      commonDirectory: "/test/common",
    },
    owner: {
      pid: child.pid,
      hostname: (await import("node:os")).hostname(),
      processIdentity: identity,
    },
    lane: { id: "test", board: "board.md" },
    acquiredAt: "2000-01-01T00:00:00.000Z",
  };
  assert.equal(
    (await verifyOwnerIdentity(owner)).state,
    "active",
    "old timestamps do not expire a live identity",
  );
  child.kill("SIGKILL");
  await new Promise((resolve) => child.once("exit", resolve));
  const stale = await verifyOwnerIdentity(owner);
  assert.equal(stale.state, "stale_verified");
  assert.match(stale.reason, /pid_absent|pid_reused/);
});

test("CLI refuses unsafe environment and mirrors a safe child nonzero exit", async (t) => {
  const item = await fixture();
  t.after(() => rm(item.root, { recursive: true, force: true }));
  const args = [
    SCRIPT,
    "--checkout",
    item.checkout,
    "--inventory",
    item.inventoryPath,
    "--run",
    "--lane",
    item.lane.id,
    "--",
    ...item.childCommand,
  ];
  const unsafe = await new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      env: { ...process.env, IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("exit", (code) => resolve({ code, stderr }));
  });
  assert.equal(unsafe.code, 78);
  assert.match(unsafe.stderr, /must be exactly 0/);

  const safe = await new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      env: { ...process.env, IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS: "0" },
      stdio: "ignore",
    });
    child.on("exit", (code) => resolve(code));
  });
  assert.equal(safe, 23);
  const context = await resolveCheckout(item.checkout);
  assert.equal((await inspectLease(context)).state, "available");
});

test(
  "heartbeat ownership loss terminates the protected process group and exits nonzero",
  { timeout: 10_000 },
  async (t) => {
    const item = await fixture({ childSource: longRunningChildSource() });
    const markerPath = path.join(item.root, "ownership-loss-child.log");
    t.after(() => rm(item.root, { recursive: true, force: true }));
    const context = await resolveCheckout(item.checkout);
    const run = spawnLeaseRun(item, {
      [HEARTBEAT_INTERVAL_ENV]: "100",
      SWISSKNIFE_LEASE_TEST_MARKER: markerPath,
    });
    let owner;
    t.after(() => cleanUpProtectedRun(run.child, owner));
    owner = await waitForProtectedChild(context, markerPath);
    const immutableOwner = JSON.parse(
      await readFile(path.join(context.leaseDirectory, "owner.json"), "utf8"),
    );
    assert.equal(immutableOwner.childPid, null);
    assert.equal(immutableOwner.childProcessIdentity, null);

    const replacementOwner = {
      ...owner,
      leaseId: "11111111-1111-4111-8111-111111111111",
    };
    await replaceOwnerBytes(
      context,
      `${JSON.stringify(replacementOwner, null, 2)}\n`,
    );

    const result = await run.result;
    assert.equal(result.code, 73);
    assert.equal(result.signal, null);
    assert.match(result.stderr, /heartbeat failed closed/);
    assert.match(result.stderr, /ownership lost during heartbeat/i);
    assert.doesNotMatch(result.stderr, /attempt 2\/3/);
    assert.match(await readFile(markerPath, "utf8"), /SIGTERM/);
    assert.equal(
      JSON.parse(
        await readFile(path.join(context.leaseDirectory, "owner.json"), "utf8"),
      ).leaseId,
      replacementOwner.leaseId,
      "the wrapper must not release or overwrite the successor lease",
    );
    await waitForProcessGroupExit(owner.childProcessGroupId);
  },
);

test(
  "persistent heartbeat refresh errors exhaust bounded retries before fail-closed termination",
  { timeout: 10_000 },
  async (t) => {
    const item = await fixture({
      childSource: longRunningChildSource({ exitOnSigterm: false }),
    });
    const markerPath = path.join(item.root, "refresh-failure-child.log");
    t.after(() => rm(item.root, { recursive: true, force: true }));
    const context = await resolveCheckout(item.checkout);
    const run = spawnLeaseRun(item, {
      [HEARTBEAT_INTERVAL_ENV]: "100",
      SWISSKNIFE_LEASE_TEST_MARKER: markerPath,
    });
    let owner;
    t.after(() => cleanUpProtectedRun(run.child, owner));
    owner = await waitForProtectedChild(context, markerPath);
    await replaceOwnerBytes(context, "{broken");

    const result = await run.result;
    assert.equal(result.code, 73);
    assert.equal(result.signal, null);
    assert.match(result.stderr, /attempt 1\/3/);
    assert.match(result.stderr, /attempt 2\/3/);
    assert.match(result.stderr, /failed after 3 attempts/);
    assert.match(result.stderr, /heartbeat failed closed/);
    assert.match(await readFile(markerPath, "utf8"), /SIGTERM/);
    assert.equal(
      await readFile(path.join(context.leaseDirectory, "owner.json"), "utf8"),
      "{broken",
    );
    await waitForProcessGroupExit(owner.childProcessGroupId);
  },
);

test(
  "operator SIGTERM remains a clean child shutdown and releases the lease",
  { timeout: 10_000 },
  async (t) => {
    const item = await fixture({ childSource: longRunningChildSource() });
    const markerPath = path.join(item.root, "operator-sigterm-child.log");
    t.after(() => rm(item.root, { recursive: true, force: true }));
    const context = await resolveCheckout(item.checkout);
    const run = spawnLeaseRun(item, {
      SWISSKNIFE_LEASE_TEST_MARKER: markerPath,
    });
    let owner;
    t.after(() => cleanUpProtectedRun(run.child, owner));
    owner = await waitForProtectedChild(context, markerPath);

    run.child.kill("SIGTERM");
    const result = await run.result;
    assert.equal(result.code, 0);
    assert.equal(result.signal, null);
    assert.doesNotMatch(result.stderr, /heartbeat failed/);
    assert.match(await readFile(markerPath, "utf8"), /SIGTERM/);
    assert.equal((await inspectLease(context)).state, "available");
    await waitForProcessGroupExit(owner.childProcessGroupId);
  },
);

test("a killed outer wrapper cannot be reclaimed while its protected child group is alive", async (t) => {
  const item = await fixture({ childSource: "setTimeout(() => {}, 700)" });
  t.after(() => rm(item.root, { recursive: true, force: true }));
  const context = await resolveCheckout(item.checkout);
  const wrapper = spawn(
    process.execPath,
    [
      SCRIPT,
      "--checkout",
      item.checkout,
      "--inventory",
      item.inventoryPath,
      "--run",
      "--lane",
      item.lane.id,
      "--",
      ...item.childCommand,
    ],
    {
      env: { ...process.env, IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS: "0" },
      stdio: "ignore",
    },
  );
  t.after(() => {
    if (wrapper.exitCode === null && wrapper.signalCode === null)
      wrapper.kill("SIGKILL");
  });

  let owner;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      owner = (await inspectLease(context)).owner;
      if (owner.childProcessIdentity) break;
    } catch {
      // The atomic lease or protected-child update has not been published yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(
    owner?.childProcessIdentity,
    "protected child identity was published before command launch",
  );
  t.after(() => {
    if (owner?.childProcessGroupId) {
      try {
        process.kill(-owner.childProcessGroupId, "SIGKILL");
      } catch {
        // The protected process group already ended.
      }
    }
  });

  wrapper.kill("SIGKILL");
  await new Promise((resolve) => wrapper.once("exit", resolve));
  const protectedInspection = await inspectLease(context);
  assert.equal(protectedInspection.state, "active");
  assert.match(
    protectedInspection.reason,
    /protected_(child_identity_matches|process_group_member_alive)/,
  );

  let staleInspection;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    staleInspection = await inspectLease(context);
    if (staleInspection.state === "stale_verified") break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(staleInspection.state, "stale_verified");
  const reclaim = execFileSync(
    process.execPath,
    [
      SCRIPT,
      "--checkout",
      item.checkout,
      "--inventory",
      item.inventoryPath,
      "--reclaim",
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(JSON.parse(reclaim).state, "available");
  assert.equal((await inspectLease(context)).state, "available");
  assert.ok(
    (await readdir(context.commonDirectory)).some((name) =>
      name.startsWith("swissknife-checkout-lease-v1.reclaimed-"),
    ),
    "verified-stale owner metadata is retained as an audit receipt",
  );
});

test("check fails closed and leaves corrupt owner bytes untouched", async (t) => {
  const item = await fixture();
  t.after(() => rm(item.root, { recursive: true, force: true }));
  const context = await resolveCheckout(item.checkout);
  await mkdir(context.leaseDirectory, { mode: 0o700 });
  const ownerPath = path.join(context.leaseDirectory, "owner.json");
  await writeFile(ownerPath, "{broken", { mode: 0o600 });

  const result = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        SCRIPT,
        "--checkout",
        item.checkout,
        "--inventory",
        item.inventoryPath,
        "--check",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("exit", (code) => resolve({ code, stderr }));
  });
  assert.equal(result.code, 78);
  assert.match(result.stderr, /Invalid JSON/);
  assert.equal(await readFile(ownerPath, "utf8"), "{broken");
});

test("explicit reclaim can archive a verified-stale namespace from a replaced Git directory", async (t) => {
  const item = await fixture();
  t.after(() => rm(item.root, { recursive: true, force: true }));
  const context = await resolveCheckout(item.checkout);
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 10_000)"], {
    stdio: "ignore",
  });
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  });
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  const childIdentity = await readProcessIdentity(child.pid);
  await acquireLease(context, item.lane, item.childCommand);

  const ownerPath = path.join(context.leaseDirectory, "owner.json");
  const owner = JSON.parse(await readFile(ownerPath, "utf8"));
  owner.namespace.id = "superseded-common-directory-instance";
  owner.owner = {
    pid: child.pid,
    hostname: (await import("node:os")).hostname(),
    processIdentity: childIdentity,
  };
  await writeFile(ownerPath, `${JSON.stringify(owner, null, 2)}\n`);
  child.kill("SIGKILL");
  await new Promise((resolve) => child.once("exit", resolve));

  await assert.rejects(
    inspectLease(context),
    (error) => error.code === "namespace_mismatch",
    "ordinary inspection remains fail-closed",
  );

  const reclaim = execFileSync(
    process.execPath,
    [
      SCRIPT,
      "--checkout",
      item.checkout,
      "--inventory",
      item.inventoryPath,
      "--reclaim",
      "--json",
    ],
    { encoding: "utf8" },
  );
  const result = JSON.parse(reclaim);
  assert.equal(result.state, "available");
  assert.match(result.reason, /reclaimed_after_pid_absent/);
  assert.equal((await inspectLease(context)).state, "available");
  assert.ok(
    (await readdir(context.commonDirectory)).some((name) =>
      name.startsWith("swissknife-checkout-lease-v1.reclaimed-"),
    ),
  );
});

test("parent worktrees contend through one common Git-directory namespace", async (t) => {
  const item = await fixture();
  t.after(() => rm(item.root, { recursive: true, force: true }));
  const sibling = path.join(item.root, "parent-sibling");
  git(item.parent, "worktree", "add", "-q", "--detach", sibling, "HEAD");
  git(
    sibling,
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "update",
    "--init",
    "-q",
    "swissknife",
  );

  const first = await resolveCheckout(item.checkout);
  const second = await resolveCheckout(path.join(sibling, "swissknife"));
  assert.equal(first.commonDirectory, second.commonDirectory);
  assert.equal(first.leaseDirectory, second.leaseDirectory);
  assert.equal(first.namespaceId, second.namespaceId);

  const owner = await acquireLease(first, item.lane, item.childCommand);
  await assert.rejects(
    acquireLease(second, item.lane, item.childCommand),
    (error) => error.code === "lease_held",
  );
  await releaseLease(first, owner.leaseId);
});

test("inventory validation rejects missing safety controls and incoherent lane metadata", async (t) => {
  const item = await fixture();
  t.after(() => rm(item.root, { recursive: true, force: true }));
  const inventory = JSON.parse(await readFile(item.inventoryPath, "utf8"));
  inventory.lanes[0].launch.requiredArguments = [
    "--no-worktree-reconciliation",
  ];
  inventory.lanes[0].launch.command[
    inventory.lanes[0].launch.command.indexOf("--state-prefix") + 1
  ] = "wrong_state";
  await writeFile(item.inventoryPath, `${JSON.stringify(inventory)}\n`);

  const result = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        SCRIPT,
        "--checkout",
        item.checkout,
        "--inventory",
        item.inventoryPath,
        "--check",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("exit", (code) => resolve({ code, stderr }));
  });
  assert.equal(result.code, 78);
  assert.match(result.stderr, /no-ephemeral-worktree/);
  assert.match(result.stderr, /state-prefix/);
});

test("run refuses a command that differs from the audited lane command", async (t) => {
  const item = await fixture();
  t.after(() => rm(item.root, { recursive: true, force: true }));
  const differentCommand = [...item.childCommand];
  differentCommand[2] = "process.exit(0)";
  const result = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        SCRIPT,
        "--checkout",
        item.checkout,
        "--inventory",
        item.inventoryPath,
        "--run",
        "--lane",
        item.lane.id,
        "--",
        ...differentCommand,
      ],
      {
        env: { ...process.env, IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("exit", (code) => resolve({ code, stderr }));
  });
  assert.equal(result.code, 78);
  assert.match(
    result.stderr,
    /does not match its audited inventory exact policy/,
  );
});

test("run publishes a verifiable lease token to the foreground child", async (t) => {
  const childSource = String.raw`
const fs = require('node:fs');
const owner = JSON.parse(fs.readFileSync(process.env.SWISSKNIFE_CHECKOUT_LEASE_OWNER_FILE, 'utf8'));
if (owner.leaseId !== process.env.SWISSKNIFE_CHECKOUT_LEASE_ID) process.exit(31);
if (owner.lane.id !== process.env.SWISSKNIFE_CHECKOUT_LEASE_LANE) process.exit(32);
if (owner.lane.board !== process.env.SWISSKNIFE_CHECKOUT_LEASE_BOARD) process.exit(33);
process.exit(0);
`;
  const item = await fixture({ childSource });
  t.after(() => rm(item.root, { recursive: true, force: true }));
  const code = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        SCRIPT,
        "--checkout",
        item.checkout,
        "--inventory",
        item.inventoryPath,
        "--run",
        "--lane",
        item.lane.id,
        "--",
        ...item.childCommand,
      ],
      {
        env: { ...process.env, IPFS_ACCELERATE_AGENT_MAX_DIRTY_ATTEMPTS: "0" },
        stdio: "ignore",
      },
    );
    child.on("exit", resolve);
  });
  assert.equal(code, 0);
  assert.equal(
    (await inspectLease(await resolveCheckout(item.checkout))).state,
    "available",
  );
});

test("a changed PID namespace fails closed instead of proving staleness", async () => {
  const identity = await readProcessIdentity(process.pid);
  if (identity.method !== "linux-procfs-starttime-v1") return;
  const owner = {
    schemaVersion: 1,
    leaseId: "00000000-0000-4000-8000-000000000000",
    namespace: {
      name: NAMESPACE_NAME,
      id: "test-namespace",
      commonDirectory: "/test/common",
    },
    owner: {
      pid: process.pid,
      hostname: (await import("node:os")).hostname(),
      processIdentity: { ...identity, pidNamespace: "pid:[different]" },
    },
    lane: { id: "test", board: "board.md" },
  };
  const result = await verifyOwnerIdentity(owner);
  assert.equal(result.state, "unverifiable");
  assert.equal(result.reason, "pid_namespace_changed");
});
