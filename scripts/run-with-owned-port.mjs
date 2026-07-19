#!/usr/bin/env node
/**
 * SVD-131: run a command against a uniquely leased, ownership-verified
 * loopback port instead of a fixed default that might already belong to
 * another active process (a foreign adapter, another worktree, or a
 * concurrent supervisor validation run).
 *
 * Usage:
 *   node scripts/run-with-owned-port.mjs \
 *     --env-var SWISSKNIFE_LIVE_GATEWAY_E2E_PORT \
 *     --preferred 3001 \
 *     -- <command> [args...]
 *
 * The resolved port is exported as `process.env[envVar]` for the child
 * command. If `--preferred` is free, it is used (preserving today's default
 * developer experience); if it is already owned by another listener, that
 * listener is left completely untouched and a private free port is leased
 * instead so this evidence run never fails just because something else is
 * using the conventional port, and never reuses a server it did not start.
 */

import { spawnSync } from 'node:child_process';
import { findOwnedPort } from './lib/pick-free-port.mjs';

function parseArgs(argv) {
  const options = { envVar: null, preferred: null, command: [] };
  let index = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (token === '--') {
      options.command = argv.slice(index + 1);
      break;
    } else if (token === '--env-var') {
      options.envVar = argv[index + 1];
      index += 2;
    } else if (token === '--preferred') {
      options.preferred = Number(argv[index + 1]);
      index += 2;
    } else {
      throw new Error(`Unrecognized argument: ${token}`);
    }
  }
  if (!options.envVar) throw new Error('--env-var <NAME> is required');
  if (options.command.length === 0) throw new Error('a command is required after --');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { port, leasedFromPreferred } = await findOwnedPort({ preferredPort: options.preferred });
  if (options.preferred && !leasedFromPreferred) {
    console.log(
      `[run-with-owned-port] preferred port ${options.preferred} is already owned by another ` +
        `process; leaving it untouched and leasing verified-free port ${port} instead.`,
    );
  } else {
    console.log(`[run-with-owned-port] leased verified-free port ${port} for ${options.envVar}.`);
  }

  const [command, ...commandArgs] = options.command;
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, [options.envVar]: String(port) },
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
