/**
 * run-all.mjs – Führt alle Browser-Tests (tests/e2e/*.mjs) nacheinander aus.
 * Aufruf: npm run test:e2e   (optional Filter: node tests/e2e/run-all.mjs ch2 smoke)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SKIP = new Set(['harness.mjs', 'run-all.mjs']);
const filters = process.argv.slice(2);

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.mjs') && !SKIP.has(f))
  .filter((f) => filters.length === 0 || filters.some((flt) => f.includes(flt)))
  .sort();

const results = [];
for (const file of files) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [path.join(DIR, file)], { stdio: 'inherit' });
  results.push({ file, ok: run.status === 0, ms: Date.now() - started });
}

console.log('\n=== E2E-Zusammenfassung ===');
for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'}  ${r.file} (${r.ms} ms)`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} Testdateien bestanden`);
process.exit(failed ? 1 : 0);
