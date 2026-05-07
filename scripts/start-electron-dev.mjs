import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
if (typeof electronPath !== 'string' || !electronPath) {
  console.error('Failed to resolve Electron executable from electron package.', { electronPath });
  process.exit(1);
}
const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? 'http://127.0.0.1:5173';
console.log('[dev-electron] electronPath=', electronPath);
console.log('[dev-electron] cwd=', process.cwd());
console.log('[dev-electron] rendererUrl=', rendererUrl);
const child = spawn(electronPath, ['.'], { stdio: 'inherit', shell: false, windowsHide: false, env: { ...process.env, VILLANI_MINI_DEV: '1', ELECTRON_RENDERER_URL: rendererUrl } });
child.on('error', (error) => { console.error('[dev-electron] spawn error', error); process.exit(1); });
child.on('exit', (code, signal) => { if (signal) { process.kill(process.pid, signal); return; } process.exit(code ?? 0); });
