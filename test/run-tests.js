'use strict';

const fs = require('fs');
const path = require('path');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

global.test = test;

async function run() {
  const testDir = __dirname;
  const files = fs
    .readdirSync(testDir)
    .filter((file) => file.endsWith('.test.js'))
    .sort();

  for (const file of files) {
    require(path.join(testDir, file));
  }

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`  PASS  ${t.name}`);
    } catch (err) {
      failed++;
      console.error(`  FAIL  ${t.name}`);
      console.error(`        ${err && err.stack ? err.stack : err}`);
    }
  }

  console.log(`\nTotal: ${tests.length}, Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
