import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'dist/main/main.js',
  'dist/main/preload.js',
  'dist/renderer/index.html',
  'dist/package.json',
];

for (const relPath of requiredFiles) {
  const absPath = path.join(root, relPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Build preflight failed: missing ${relPath}`);
  }
}

const distPkgPath = path.join(root, 'dist/package.json');
const distPkg = JSON.parse(fs.readFileSync(distPkgPath, 'utf8'));
if (distPkg.type !== 'commonjs') {
  throw new Error('Build preflight failed: dist/package.json must contain {"type":"commonjs"}');
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

console.log('Electron build preflight passed.');
