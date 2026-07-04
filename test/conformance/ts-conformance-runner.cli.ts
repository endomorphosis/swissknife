import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { parseCliArgs, runTsConformance } from './ts-conformance-runner.js';

async function main(): Promise<void> {
  const envelope = await runTsConformance(parseCliArgs(process.argv.slice(2)));
  if (!process.argv.includes('--out')) {
    console.log(JSON.stringify(envelope, null, 2));
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
