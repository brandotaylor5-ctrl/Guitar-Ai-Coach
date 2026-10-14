/**
 * Build for the browser, with no bundler and no dependencies.
 *
 * Node can strip TypeScript types itself, so a build is really just two steps:
 * blank out the types, and rewrite `./x.ts` import specifiers to `./x.js`.
 * Stripping preserves source positions exactly, so line numbers in the emitted
 * JavaScript still match the TypeScript they came from.
 *
 *   src/**\/*.ts   →  dist/src/**\/*.js
 *   web/**\/*.ts   →  dist/web/**\/*.js
 *   web/*.{html,css,js}  copied as-is
 *
 * The tree is mirrored under `dist/`, so every relative import resolves to the
 * same place it did in the source tree.
 */

import { stripTypeScriptTypes } from 'node:module';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist');

/** Rewrite relative `.ts` specifiers to `.js`, leaving string literals alone. */
function rewriteSpecifiers(code, rel) {
  const vendor = relative(dirname(rel), 'vendor/fflate.js').replaceAll('\\', '/');
  return code.replace(/(\bfrom\s*)(['"])fflate\2/g, (_, lead, quote) => `${lead}${quote}${vendor.startsWith('.') ? vendor : './'+vendor}${quote}`).replace(
    /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.\.?\/[^'"]*?)\.ts\2/g,
    (_, lead, quote, path) => `${lead}${quote}${path}.js${quote}`,
  );
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'dist' || entry.name === 'node_modules') continue;
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

async function emit(outPath, contents) {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, contents);
}

async function build() {
  await rm(OUT, { recursive: true, force: true });
  let compiled = 0;
  let copied = 0;

  for (const dir of ['src', 'web']) {
    for await (const file of walk(join(ROOT, dir))) {
      const rel = relative(ROOT, file);
      if (file.endsWith('.ts')) {
        const source = await readFile(file, 'utf8');
        const stripped = stripTypeScriptTypes(source, { mode: 'strip' });
        await emit(join(OUT, rel.replace(/\.ts$/, '.js')), rewriteSpecifiers(stripped, rel));
        compiled++;
      } else if (/\.(html|css|js|json|svg|png|woff2?)$/.test(file)) {
        await emit(join(OUT, rel), await readFile(file));
        copied++;
      }
    }
  }
  await emit(join(OUT,'vendor/fflate.js'),await readFile(join(ROOT,'node_modules/fflate/esm/browser.js')));
  const assets=[];const digest=createHash('sha256');
  for await(const file of walk(OUT))if(!file.endsWith('service-worker.js')){assets.push(relative(join(OUT,'web'),file).replaceAll('\\','/'));digest.update(await readFile(file));}
  const sw=await readFile(join(ROOT,'web/service-worker.js'),'utf8');
  await emit(join(OUT,'web/service-worker.js'),sw.replace('__WORKBENCH_CACHE__',`guitar-workbench-${digest.digest('hex').slice(0,16)}`).replace('__WORKBENCH_SHELL__',JSON.stringify(assets)));

  // A root page, so a static host serving dist/ directly still lands somewhere.
  // The dev server redirects instead; a plain file host has no way to.
  await emit(join(OUT, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Guitar Workbench</title>
<meta http-equiv="refresh" content="0; url=./web/index.html">
<link rel="canonical" href="./web/index.html">
</head>
<body><p><a href="./web/index.html">Open Guitar Workbench</a></p></body>
</html>
`);

  console.log(`Built ${compiled} modules, copied ${copied} files → dist/`);
}

build().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
