import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const inventory = [];
for (const app of ['frontend', 'backend']) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, app, 'package.json'), 'utf8'));
  for (const [scope, dependencies] of Object.entries({
    runtime: manifest.dependencies,
    development: manifest.devDependencies,
  })) {
    for (const name of Object.keys(dependencies)) {
      const installed = JSON.parse(fs.readFileSync(path.join(root, app, 'node_modules', name, 'package.json'), 'utf8'));
      inventory.push({ app, scope, name, version: installed.version, license: installed.license ?? 'UNSPECIFIED' });
    }
  }
}
const target = path.join(root, 'docs', 'third-party.json');
fs.writeFileSync(target, JSON.stringify({ generatedOn: '2026-11-07', directDependencies: inventory }, null, 2) + '\n');
console.log(`Recorded ${inventory.length} direct dependency versions and declared licenses in docs/third-party.json`);
