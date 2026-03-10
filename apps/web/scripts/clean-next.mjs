import fs from 'fs';
import path from 'path';

const nextDir = path.join(process.cwd(), '.next');

try {
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log(`Removed ${nextDir}`);
} catch (error) {
  console.warn(`Unable to fully remove ${nextDir}.`);
  console.warn(error);
  process.exitCode = 0;
}
