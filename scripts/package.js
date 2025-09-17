#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');

// Ensure dist is built
console.log('Running build...');
execSync('npm run build', { stdio: 'inherit', cwd: root });

const outPath = path.join(root, 'github-stars-extension.zip');
const output = fs.createWriteStream(outPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`Created ${outPath} (${archive.pointer()} total bytes)`);
});

archive.on('warning', (err) => {
  if (err.code === 'ENOENT') console.warn(err.message);
  else throw err;
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// Files/folders to include in the packaged zip
const includes = [
  'manifest.json',
  'dist',
  'src/styles',
  'src/options.html',
  'src/options.js',
  'icons'
];

for (const p of includes) {
  const full = path.join(root, p);
  if (!fs.existsSync(full)) continue;
  const stat = fs.statSync(full);
  if (stat.isDirectory()) {
    archive.directory(full, p);
  } else {
    archive.file(full, { name: p });
  }
}

archive.finalize();
