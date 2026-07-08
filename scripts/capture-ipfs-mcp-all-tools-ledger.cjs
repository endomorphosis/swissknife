#!/usr/bin/env node
const { captureAllToolsLedger } = require('./all-tools-evidence-lib.cjs');

captureAllToolsLedger()
  .then(ledger => {
    console.log(JSON.stringify(ledger.summary, null, 2));
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
