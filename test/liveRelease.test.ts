import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('public release and cache recovery', () => {
  const page = readFileSync('web/index.html', 'utf8');
  const repair = readFileSync('repair.html', 'utf8');
  const build = readFileSync('scripts/build.mjs', 'utf8');
  const deploy = readFileSync('.github/workflows/pages.yml', 'utf8');

  test('the installed app shows a release identifier and a cache repair link', () => {
    assert.match(page, /data-release="2026-11-08-cache-repair"/);
    assert.match(page, /id="build-status"/);
    assert.match(page, /href="\.\.\/repair\.html"/);
  });

  test('cache repair is deployed outside the old service worker scope', () => {
    assert.match(build, /join\(OUT, 'repair\.html'\)/);
    assert.match(repair, /new URL\('\.\/web\/index\.html'/);
    assert.match(repair, /navigator\.serviceWorker\.getRegistrations/);
    assert.match(repair, /reg\.scope\.startsWith\(scope\)/);
  });

  test('cache repair preserves user data and only clears workbench cached app versions', () => {
    assert.match(repair, /key\.startsWith\('guitar-workbench-'\)/);
    assert.match(repair, /await caches\.keys\(\)/);
    assert.doesNotMatch(repair, /localStorage\.clear\s*\(/);
    assert.doesNotMatch(repair, /indexedDB\.deleteDatabase\s*\(/);
  });

  test('live deployment checks the public lesson, practice, sound and recovery files', () => {
    for (const path of ['web/index.html','web/views/fretboardAcademy.js','web/views/practiceToday.js','web/audio/studyTone.js','repair.html']) {
      assert.ok(deploy.includes(path), 'missing live validation for ' + path);
    }
    assert.match(deploy, /urlopen\(req, timeout=12\)/);
  });
});
