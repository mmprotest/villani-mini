import { spawn } from 'node:child_process';

const electronBin = process.platform === 'win32' ? 'electron.cmd' : 'electron';

const child = spawn(electronBin, ['.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VILLANI_MINI_DEV: '1',
    ELECTRON_RENDERER_URL: process.env.ELECTRON_RENDERER_URL ?? 'http://127.0.0.1:5173',
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
