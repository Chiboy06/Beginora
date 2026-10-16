#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

// npm registry/advisory state checked 2026-10-11. Both advisories identify the
// newest published package versions as affected and list no patched release.
// Keep this list exact and temporary: any new high/critical advisory fails CI.
const ALLOWED_HIGH = new Map([
  ["GHSA-VFJ7-8CJW-P6XM", { packageName: "braces", affectedRange: "<=3.0.3" }],
  ["GHSA-86W9-CPQP-85RV", { packageName: "node-forge", affectedRange: "<=1.4.0" }],
]);

function fail(message) {
  console.error(`\nSecurity audit policy FAILED: ${message}`);
  process.exit(1);
}

// Constant command through a shell: Windows ships npm as npm.cmd, which Node only spawns via a shell.
const audit = spawnSync("npm audit --json", {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, NO_COLOR: "1" },
  shell: true,
});
if (audit.error) fail(`could not run npm audit: ${audit.error.message}`);

const stdout = audit.stdout || "";
const jsonStart = stdout.indexOf("{");
const jsonEnd = stdout.lastIndexOf("}");
if (jsonStart < 0 || jsonEnd < jsonStart) {
  console.error((audit.stderr || "").slice(-4000));
  fail("npm audit did not return a JSON report");
}

let report;
try {
  report = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
} catch (error) {
  fail(`could not parse npm audit report: ${error.message}`);
}

const totals = report.metadata?.vulnerabilities;
if (!totals || !report.vulnerabilities) fail("audit report is missing vulnerability metadata");
if (totals.critical > 0) fail(`${totals.critical} critical vulnerability/vulnerabilities found`);

const seenAllowed = new Set();
const unexpected = new Set();
const unresolved = new Set();
const highPackages = Object.entries(report.vulnerabilities)
  .filter(([, item]) => item.severity === "high" || item.severity === "critical");

for (const [packageName, item] of highPackages) {
  let foundHighAdvisory = false;
  for (const via of item.via || []) {
    if (typeof via === "string") {
      if (!report.vulnerabilities[via]) unresolved.add(`${packageName} -> ${via}`);
      continue; // npm uses these references to roll leaf advisories up the graph
    }
    if (!via || (via.severity !== "high" && via.severity !== "critical")) continue;
    foundHighAdvisory = true;
    const id = (via.url || "").match(/GHSA-[a-z0-9-]+/i)?.[0]?.toUpperCase();
    const allowance = id ? ALLOWED_HIGH.get(id) : undefined;
    if (!allowance || via.name !== allowance.packageName || via.range !== allowance.affectedRange) {
      unexpected.add(`${packageName}: ${id || via.name || "unknown advisory"} (${via.range || "unknown range"})`);
    } else {
      seenAllowed.add(id);
    }
  }
  if (!foundHighAdvisory && !(item.via || []).some((via) => typeof via === "string")) {
    unexpected.add(`${packageName}: high severity with no traceable advisory`);
  }
}

if (unresolved.size) fail(`unresolved audit references: ${[...unresolved].join(", ")}`);
if (unexpected.size) fail(`unapproved high/critical findings:\n- ${[...unexpected].join("\n- ")}`);

console.log(`npm audit: ${totals.total} total (${totals.moderate} moderate, ${totals.high} high, ${totals.critical} critical).`);
for (const id of seenAllowed) {
  const item = ALLOWED_HIGH.get(id);
  console.warn(`KNOWN UPSTREAM ADVISORY ALLOWED: ${id} ${item.packageName}${item.affectedRange}; no patched package was published at the last registry check. Recheck before release.`);
}
console.log("Security gate passed: no critical findings and no unapproved high-severity advisories.");
