import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'dist/main/main.js',
  'dist/main/preload.js',
  'dist/renderer/index.html',
];

for (const relPath of requiredFiles) {
  const absPath = path.join(root, relPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Build preflight failed: missing ${relPath}`);
  }
}

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (!pkg.main) {
  throw new Error('Build preflight failed: package.json is missing "main"');
}

const mainAbsPath = path.join(root, pkg.main);
if (!fs.existsSync(mainAbsPath)) {
  throw new Error(`Build preflight failed: package.json main points to missing file: ${pkg.main}`);
}

const distMainPkgPath = path.join(root, 'dist/main/package.json');
fs.writeFileSync(distMainPkgPath, JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');

console.log('Electron build preflight passed.');
