#!/usr/bin/env node
/**
 * SVD-131: unique, ownership-verified endpoint selection for test-owned
 * evidence servers.
 *
 * Release-readiness evidence producers that need a live desktop/HTTP server
 * (the application-originated gateway replay and the Meta glasses simulator
 * replay) must never silently attach to a server they did not start
 * themselves -- an already-listening process on the conventional port could
 * belong to another active worktree, another concurrent supervisor
 * validation, or a developer's own `npm run desktop`. Killing or reusing
 * that listener would corrupt both runs' evidence.
 *
 * `findOwnedPort` proves ownership the only way that is actually reliable:
 * it binds the candidate port exclusively itself, immediately releases it,
 * and only then hands the verified-free port number back to the caller so a
 * process it fully controls (e.g. Playwright's `webServer`) can bind it for
 * real. If the preferred port is already owned by someone else, this leaves
 * that listener completely untouched and leases a private, unused port
 * instead of failing the whole evidence run.
 */

import net from 'node:net';

/**
 * Resolves once `port` on `host` can be exclusively bound by this process,
 * or `false` if it is already owned by another listener.
 */
function canBind(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen({ host, port, exclusive: true }, () => {
      server.close((closeError) => resolve(!closeError));
    });
  });
}

/**
 * Finds a free TCP port this process can currently bind, preferring
 * `preferredPort` (and the next `fallbackRange` ports after it) before
 * falling back to an OS-assigned ephemeral port. Never touches, inspects, or
 * closes anyone else's listener -- ports that are already bound are simply
 * skipped.
 */
export async function findOwnedPort({
  host = '127.0.0.1',
  preferredPort,
  fallbackRange = 64,
} = {}) {
  const owner = 'current-process-exclusive-bind-probe';
  if (Number.isInteger(preferredPort)) {
    for (let offset = 0; offset < fallbackRange; offset += 1) {
      const candidate = preferredPort + offset;
      if (candidate > 65535) break;
      // eslint-disable-next-line no-await-in-loop
      if (await canBind(host, candidate)) {
        return {
          host,
          port: candidate,
          leasedFromPreferred: offset === 0,
          owner,
          foreignListenerAction: offset === 0 ? 'none-observed' : 'left-untouched',
        };
      }
    }
  }
  // Every candidate in the preferred range is already owned; ask the OS for
  // a currently-unused ephemeral port instead of guessing further.
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen({ host, port: 0, exclusive: true }, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((closeError) => {
        if (closeError || !port) {
          reject(closeError ?? new Error('failed to lease an ephemeral port'));
          return;
        }
        resolve({
          host,
          port,
          leasedFromPreferred: false,
          owner,
          foreignListenerAction: Number.isInteger(preferredPort) ? 'left-untouched' : 'none-observed',
        });
      });
    });
  });
}
