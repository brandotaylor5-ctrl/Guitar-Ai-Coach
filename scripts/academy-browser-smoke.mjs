/**
 * Browser smoke test: click the curriculum that a person actually sees.
 *
 * Unit tests of data and a green deployment are NOT sufficient: a lesson
 * recommendation can be clickable yet produce no visible change. This test
 * requires a real Chromium DOM, real navigation and persistence, and genuine
 * click events. It runs after the production app is built.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port = 4198;
const origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
let serverLog = '';
server.stdout.on('data', d => { serverLog += String(d); });
server.stderr.on('data', d => { serverLog += String(d); });

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(origin + '/web/index.html');
      if (r.status === 200) return;
    } catch { /* still starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('App server did not start: ' + serverLog);
}

const failures = [];
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => failures.push('Browser JavaScript error: ' + e.message));
  await page.goto(origin + '/web/index.html#rhythm', { waitUntil: 'domcontentloaded' });
  await page.locator('.rhythm-start-card').waitFor({ timeout: 15000 });

  // Beginners must choose an appropriate starting point before exercises.
  // The first lesson teaches tapping or muted strumming, not G fingering.
  assert.equal(await page.locator('.rhythm-active-lesson').count(), 0);
  await page.locator('.rhythm-start-option').first().click();
  await page.locator('.rhythm-active-lesson').waitFor();
  assert.match(await page.locator('.rhythm-active-lesson h2').innerText(), /Find the pulse/);
  assert.match(await page.locator('.rhythm-active-lesson').innerText(), /Without forming a chord/);
  assert.match(await page.locator('.rhythm-active-lesson').innerText(), /four complete bars/);
  assert.equal(await page.locator('.rhythm-lesson-map').count(), 0);

  await page.getByRole('button', { name: 'Hear the example' }).click();
  assert.match(await page.locator('.rhythm-sound-status').innerText(), /Reference requested|Reference finished|Sound could not start/);
  await page.getByRole('button', { name: 'Keeping four beats evenly spaced' }).click();
  await page.getByText('Concept check passed.').waitFor();
  await page.getByRole('button', { name: 'I practiced this' }).click();
  await page.getByText('Practice attempts reported: 1').waitFor();
  await page.getByRole('button', { name: 'I played it without the guide' }).click();
  assert.match(await page.locator('.rhythm-evidence').innerText(), /self-reported/);
  await page.getByRole('button', { name: 'Next lesson: Discover the & between beats' }).click();
  assert.match(await page.locator('.rhythm-active-lesson h2').innerText(), /Discover the & between beats/);

  // Persistence is real browser storage, not a fake in-memory state.
  await page.reload();
  await page.locator('.rhythm-lesson-map').waitFor();
  assert.match(await page.locator('.rhythm-overview').innerText(), /1\/8/);

  // Navigate to and from Learn, then open the parallel barre clinic.
  await page.getByRole('button', { name: 'Back to Learn' }).click();
  await page.locator('.academy-more summary').click();
  await page.getByRole('button', { name: 'Barre-chord rescue' }).click();
  await page.locator('.rhythm-clinic').waitFor();
  await page.getByRole('button', { name: 'Four-chord song' }).click();
  assert.match(await page.locator('.rhythm-clinic').innerText(), /C♯m.*G♯.*A.*E/s);
  await page.getByRole('button', { name: 'I worked on this today' }).click();
  assert.match(await page.locator('.rhythm-clinic').innerText(), /sessions noted: 1/);

  // An experienced guitarist should not be forced into four basic downstrokes.
  // Self-selected starting level does NOT mark earlier lessons as passed.
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const second = await fresh.newPage();
  second.on('pageerror', e => failures.push('Fresh browser JS error: ' + e.message));
  await second.goto(origin + '/web/index.html#rhythm', { waitUntil: 'domcontentloaded' });
  await second.locator('.rhythm-start-card').waitFor();
  await second.locator('.rhythm-start-option').last().click();
  assert.match(await second.locator('.rhythm-active-lesson h2').innerText(), /Make the space between beats count/);
  const state = await second.evaluate(() => ({
    start: localStorage.getItem('guitar-academy.rhythm-entry.v1'),
    progress: localStorage.getItem('guitar-academy.rhythm-chapter.v1'),
  }));
  assert.equal(state.start, 'songs');
  assert.equal(state.progress, null, 'placement never creates phantom mastery');
  await second.reload();
  await second.locator('.rhythm-lesson-map').waitFor();
  await second.getByRole('button', { name: /Go to suggested lesson: Make the space between beats count/ }).click();
  assert.match(await second.locator('.rhythm-active-lesson h2').innerText(), /Make the space between beats count/);
  await fresh.close();

  assert.deepEqual(failures, [], 'browser console must have no unhandled errors');
  console.log('PASS: novice and experienced placement, real mobile-width lesson clicks, reference, concept check, practice, self-report, persistent start, barre clinic and navigation.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
