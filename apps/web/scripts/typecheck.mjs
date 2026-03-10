import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectDir = process.cwd();
const tsconfigPath = join(projectDir, 'tsconfig.json');
const tempDir = join(projectDir, '.typecheck-tmp');
const tempTsconfigPath = join(tempDir, 'tsconfig.json');

try {
  mkdirSync(tempDir, { recursive: true });
  const parsed = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
  if (Array.isArray(parsed.include)) {
    parsed.include = parsed.include
      .filter((entry) => entry !== '.next/types/**/*.ts')
      .map((entry) => (entry.startsWith('../') ? entry : `../${entry}`));
  }
  if (Array.isArray(parsed.exclude)) {
    parsed.exclude = parsed.exclude.map((entry) => (entry.startsWith('../') ? entry : `../${entry}`));
  }
  writeFileSync(tempTsconfigPath, JSON.stringify(parsed, null, 2));

  const tscEntrypoint = join(projectDir, 'node_modules', 'typescript', 'bin', 'tsc');

  const result = spawnSync(process.execPath, [tscEntrypoint, '--noEmit', '-p', tempTsconfigPath], {
    cwd: projectDir,
    stdio: 'inherit',
    shell: false,
  });

  process.exit(result.status ?? 1);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
