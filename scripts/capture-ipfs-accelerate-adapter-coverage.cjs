#!/usr/bin/env node
const { captureAccelerateAdapterCoverage } = require('./all-tools-evidence-lib.cjs');

captureAccelerateAdapterCoverage()
  .then(coverage => {
    console.log(JSON.stringify(coverage.summary, null, 2));
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
