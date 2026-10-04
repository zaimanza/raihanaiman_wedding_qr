import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// The Playwright CLI callback sandbox does not expose process. Resolve the
// environment here and pass a literal URL into its otherwise unchanged checks.
const base = process.env.UPLOAD_TEST_BASE || 'http://localhost:5173';
const session = process.env.UPLOAD_TEST_SESSION || 'upload-check';
const callback = readFileSync(resolve('scripts/browser/check-upload.js'), 'utf8').replace(
  "const base = typeof process !== 'undefined' ? process.env.UPLOAD_TEST_BASE || 'http://localhost:5173' : 'http://localhost:5173';",
  `const base = ${JSON.stringify(base)};`,
);
mkdirSync(resolve('output/playwright'), { recursive: true });
const path = resolve('output/playwright/check-upload-runtime.js');
writeFileSync(path, callback);
const run = (args, allowFailure = false) => {
  const result = spawnSync('npx', ['--yes', '--package', '@playwright/cli', 'playwright-cli', `-s=${session}`, ...args], { stdio: 'inherit' });
  if (!allowFailure && (result.error || result.status !== 0)) throw result.error || new Error(`Playwright exited ${result.status}`);
};
run(['close'], true);
run(['open', 'about:blank']);
try { run(['run-code', `--filename=${path}`]); }
finally { run(['close'], true); }
