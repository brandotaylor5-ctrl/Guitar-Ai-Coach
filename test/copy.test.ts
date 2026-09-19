import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const VIEW_DIRS = ['web/views', 'web/ui'];

function sourceFiles(): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  for (const dir of VIEW_DIRS) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.ts')) continue;
      out.push({ path: join(dir, name), text: readFileSync(join(dir, name), 'utf8') });
    }
  }
  return out;
}

/** Strings a person reads, as opposed to code and comments. */
function userFacingStrings(text: string): string[] {
  const withoutComments = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return [...withoutComments.matchAll(/text:\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]!)
    .concat([...withoutComments.matchAll(/text:\s*`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1]!))
    .concat([...withoutComments.matchAll(/\bbutton\(\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]!))
    .concat([...withoutComments.matchAll(/\bempty\(\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]!));
}

/**
 * Names of things that no longer exist where a player could find them.
 *
 * Song Workshop was still telling people to "save a riff from Play or Riff
 * Lab" two days after Riff Lab left the navigation. Retiring a feature and
 * leaving its name in the copy sends somebody hunting for a screen that is
 * not there, which reads as the app being broken rather than changed.
 */
const RETIRED = ['Riff Lab'];

describe('the interface does not talk about things that are gone', () => {
  test('no screen names a retired destination', () => {
    for (const file of sourceFiles()) {
      for (const line of userFacingStrings(file.text)) {
        for (const gone of RETIRED) {
          assert.ok(!line.includes(gone),
            `${file.path} still tells the player about ${gone}: "${line.slice(0, 90)}"`);
        }
      }
    }
  });

  test('no screen assumes the reader already plays', () => {
    // Every one of these appeared on a screen a complete beginner sees first.
    const assumes = [
      /\byou already have\b/i,
      /\byou almost certainly\b/i,
      /everything here is something you played/i,
    ];
    for (const file of sourceFiles()) {
      for (const line of userFacingStrings(file.text)) {
        for (const re of assumes) {
          assert.ok(!re.test(line),
            `${file.path} assumes the reader can already play: "${line.slice(0, 90)}"`);
        }
      }
    }
  });
});
