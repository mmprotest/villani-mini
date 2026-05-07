import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const distPkgPath = path.join(distDir, 'package.json');

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(distPkgPath, JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');

console.log('Wrote dist/package.json with type=commonjs.');
