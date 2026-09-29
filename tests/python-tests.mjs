// PYTHON can name a virtual-environment interpreter on any supported OS.
import { spawnSync } from 'node:child_process';
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const result = spawnSync(python, ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'], { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
