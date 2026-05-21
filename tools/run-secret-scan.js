#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function findBash() {
  const candidates = [];
  if (process.env.BASH) candidates.push(process.env.BASH);
  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs\\Git\\bin\\bash.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs\\Git\\usr\\bin\\bash.exe')
    );
  }
  candidates.push('bash');

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate === 'bash') return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const bash = findBash();
if (!bash) {
  console.error('secret scan requires bash or Git Bash. Install Git for Windows or set BASH to bash.exe.');
  process.exit(1);
}

const script = path.join(__dirname, 'secret-scan.sh');
const args = [script].concat(process.argv.slice(2));
const result = spawnSync(bash, args, {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status == null ? 1 : result.status);
