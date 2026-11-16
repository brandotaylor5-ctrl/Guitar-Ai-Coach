/**
 * Playwright smoke test for the real mobile-width Original Songbook UI.
 * Runs against the built site, without depending on a microphone or login.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port = 4199;
const origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
const errors = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(origin + '/web/index.html')).status === 200) { ready = true; break; }
    } catch { /* keep waiting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Production preview server started');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/web/index.html#songbook', { waitUntil: 'domcontentloaded' });
  await page.locator('.sb-song-card').first().waitFor({ timeout: 15000 });
  assert.match(await page.locator('.sb-song-card').first().innerText(), /But I Digress/);
  await page.getByRole('button', { name: 'Play' }).first().click();
  assert.match(await page.locator('.sb-section').first().innerText(), /Introduction/);
  assert.equal(await page.locator('.sb-chord').first().innerText(), 'Cmaj7/G');
  await page.getByRole('button', { name: /Auto-scroll/ }).click();
  await page.waitForTimeout(120);
  assert.match(await page.locator('.sb-transport').innerText(), /Pause/);
  await page.getByRole('button', { name: /Pause/ }).click();
  assert.match(await page.locator('.sb-transport').innerText(), /Auto-scroll/);
  await page.getByRole('button', { name: /Start over/ }).click();

  await page.getByRole('button', { name: 'Edit song' }).click();
  await page.getByLabel('Song title').fill('But I Digress Draft');
  await page.getByLabel('Lyrics and chord chart').fill('# Verse\n[G]Hello [C]world');
  await page.getByRole('button', { name: 'Performance view' }).click();
  assert.match(await page.locator('.sb-performing-title').innerText(), /Draft/);
  assert.deepEqual(await page.locator('.sb-chord').allInnerTexts(), ['G', 'C']);
  await page.reload();
  await page.locator('.sb-song-card').first().waitFor({ timeout: 15000 });
  assert.match(await page.locator('.sb-song-list').innerText(), /Draft/);
  await page.getByRole('button', { name: 'Play' }).first().click();
  await page.locator('.sb-chord').first().waitFor();
  assert.match(await page.locator('.sb-performing-title').innerText(), /Draft/);

  await page.getByRole('button', { name: /Library/ }).click();
  await page.getByRole('button', { name: 'New song' }).click();
  await page.getByLabel('Song title').fill('A New Original');
  await page.getByLabel('Lyrics and chord chart').fill('# Chorus\n[Am]One more [F]song');
  await page.getByRole('button', { name: /Library/ }).click();
  assert.match(await page.locator('.sb-song-list').innerText(), /A New Original/);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /songbook.*json/);
  assert.deepEqual(errors, [], 'No browser JavaScript errors');
  console.log('PASS: songbook seed, chord rendering, mobile scroll controls, edit, persistence, create, export.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
