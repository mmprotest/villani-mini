import os from 'node:os';
import path from 'node:path';

const root = path.join(os.homedir(), '.villani-mini');
export const appPaths = {
  root,
  dataDir: path.join(root, 'data'),
  filesDir: path.join(root, 'files')
};
