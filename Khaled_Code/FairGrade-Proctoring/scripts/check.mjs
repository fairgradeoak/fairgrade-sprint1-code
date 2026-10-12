import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
let files = 0;
async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (['vendor', 'models', 'data', 'node_modules', 'test-results'].includes(entry.name)) continue;
    const full = resolve(path, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (/\.(mjs|js)$/.test(full)) {
      const result = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
      if (result.status) { process.stderr.write(result.stderr); process.exitCode = 1; }
      files++;
    }
  }
}
await walk(process.cwd()); console.log(`Syntax checked ${files} JavaScript files.`);
