#!/usr/bin/env node
const { captureServiceEvidence } = require('./all-tools-evidence-lib.cjs');

captureServiceEvidence()
  .then(({ health }) => {
    console.log(JSON.stringify(health.summary, null, 2));
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
