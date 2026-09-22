#!/usr/bin/env node
// Aggregate third-party license info for the backend prod tree into a single LICENSES.txt.
//
// Usage:
//   pnpm --filter @shulkr/backend licenses list --prod --json | node scripts/release/generate_licenses.mjs > path/to/LICENSES.txt
//
// Output format:
//   - header with shulkr version
//   - summary counts by license
//   - per-license listing (package@version)
//   - dedicated LGPL libvips notice (the only copyleft dep, bundled by sharp)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootPkg = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'package.json'), 'utf8'));

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`generate_licenses: invalid JSON on stdin: ${err.message}\n`);
    process.exit(1);
  }

  // pnpm licenses list --prod --json shape: { "<license-name>": [{ name, version, path, ... }, ...], ... }
  // Also tolerate a flat "packages" array shape used by some pnpm versions.
  const groups = Array.isArray(data?.packages)
    ? data.packages.reduce((acc, p) => {
        const lic = p.license ?? 'UNKNOWN';
        (acc[lic] ??= []).push(p);
        return acc;
      }, {})
    : data;

  const licenseNames = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);

  const lines = [];
  lines.push(`Shulkr v${rootPkg.version} — Third-Party Software Notices`);
  lines.push('=' .repeat(72));
  lines.push('');
  lines.push('This release bundles third-party packages required at runtime.');
  lines.push('Their licenses are listed below, grouped by license type.');
  lines.push('');
  lines.push('Summary');
  lines.push('-' .repeat(72));
  for (const name of licenseNames) {
    lines.push(`${name.padEnd(40)} ${String(groups[name].length).padStart(4)} package(s)`);
  }
  lines.push('');
  lines.push(`Total packages: ${licenseNames.reduce((s, n) => s + groups[n].length, 0)}`);
  lines.push('');

  for (const name of licenseNames) {
    lines.push('');
    lines.push('=' .repeat(72));
    lines.push(`License: ${name}`);
    lines.push('=' .repeat(72));
    if (name === 'LGPL-3.0-or-later') {
      lines.push('');
      lines.push('NOTICE: this category contains libvips (https://github.com/libvips/libvips),');
      lines.push('bundled by the sharp package. libvips is licensed under LGPL-3.0-or-later.');
      lines.push('Source code is available at the link above. Per LGPL section 6, recipients');
      lines.push('of this binary distribution may relink against a modified libvips by');
      lines.push('replacing the sharp-libvips-* prebuild binary in node_modules.');
    }
    lines.push('');
    const sorted = [...groups[name]].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    for (const p of sorted) {
      const ver = p.version ? `@${p.version}` : '';
      lines.push(`  ${p.name}${ver}`);
    }
  }
  lines.push('');

  process.stdout.write(lines.join('\n'));
});
