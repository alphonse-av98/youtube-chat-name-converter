'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const INCLUDE_PATHS = [
  'manifest.json',
  'LICENSE',
  'icons',
  'popup.html',
  'popup.css',
  'options.html',
  'options.css',
  'src',
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (entry === '.DS_Store' || entry === 'Thumbs.db') continue;
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function createZip(stagingDir, zipPath) {
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  if (process.platform === 'win32') {
    // Use .NET ZipArchive with explicit forward slashes for cross-platform & store compatibility
    const psScript = `
      $ErrorActionPreference = 'Stop'
      Add-Type -AssemblyName System.IO.Compression
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      $src = (Resolve-Path $env:YCNC_ZIP_SRC).Path
      $dest = $env:YCNC_ZIP_DEST
      $zip = [System.IO.Compression.ZipFile]::Open($dest, [System.IO.Compression.ZipArchiveMode]::Create)
      try {
        Get-ChildItem -Path $src -Recurse -File | ForEach-Object {
          $rel = $_.FullName.Substring($src.Length + 1).Replace('\\', '/')
          [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip,
            $_.FullName,
            $rel,
            [System.IO.Compression.CompressionLevel]::Optimal
          ) | Out-Null
        }
      } finally {
        $zip.Dispose()
      }
    `;
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
      stdio: 'inherit',
      env: { ...process.env, YCNC_ZIP_SRC: stagingDir, YCNC_ZIP_DEST: zipPath },
    });
  } else {
    execFileSync('zip', ['-r', '-q', zipPath, '.'], {
      cwd: stagingDir,
      stdio: 'inherit',
    });
  }
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'manifest.json'), 'utf8'));
  const version = manifest.version;
  if (!version) {
    throw new Error('manifest.json is missing a version field');
  }

  const zipName = `youtube-chat-name-converter-v${version}.zip`;
  const zipPath = path.join(DIST_DIR, zipName);
  const stagingDir = path.join(DIST_DIR, `.staging-v${version}`);

  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  try {
    for (const relPath of INCLUDE_PATHS) {
      const fullSrc = path.join(ROOT_DIR, relPath);
      if (!fs.existsSync(fullSrc)) {
        throw new Error(`Required release file/directory is missing: ${relPath}`);
      }
      copyRecursive(fullSrc, path.join(stagingDir, relPath));
    }

    createZip(stagingDir, zipPath);
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  const sizeKb = (fs.statSync(zipPath).size / 1024).toFixed(1);
  console.log(`Created release archive: ${path.relative(ROOT_DIR, zipPath)} (${sizeKb} KB)`);
}

main();
