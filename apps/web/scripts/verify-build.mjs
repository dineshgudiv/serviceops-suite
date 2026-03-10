import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const verifyDir = path.join(process.cwd(), '.next-verify');

try {
  fs.rmSync(verifyDir, { recursive: true, force: true });
  console.log(`Prepared clean verification directory: ${verifyDir}`);
} catch (error) {
  console.warn(`Unable to fully remove ${verifyDir} before build.`);
  console.warn(error);
}

const child = spawn('npm', ['run', 'build'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NEXT_DIST_DIR: '.next-verify',
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
