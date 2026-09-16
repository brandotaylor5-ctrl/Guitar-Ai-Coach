/**
 * The product vision, executed.
 *
 * Plays a practice session through the real pipeline — synthesised audio in,
 * notes out, ideas recognised, riff saved, attempt coached — and prints what
 * the app would say at each point. Run it with: npm run demo
 */

import { SketchbookSession } from '../src/session/session.ts';
import { explainMood, explainPhrase, explainRelation, renderExplanation } from '../src/explain/explain.ts';
import { suggestAnswer, suggestChords, suggestEndings } from '../src/create/suggest.ts';
import { practiceAttempt } from '../src/practice/practice.ts';
import { buildFingerprint, describeFingerprint, suggestDeparture } from '../src/fingerprint/fingerprint.ts';
import { renderDiff } from '../src/phrase/diff.ts';
import { midiToFrequency, midiToName, nameToMidi } from '../src/music/notes.ts';
import type { NoteEvent } from '../src/types.ts';

const SR = 44100;

function heading(text: string): void {
  console.log(`\n\x1b[1m${text}\x1b[0m`);
  console.log('─'.repeat(text.length));
}

function said(text: string): void {
  console.log(text.split('\n').map((line) => `  \x1b[36m${line}\x1b[0m`).join('\n'));
}

/** A rough plucked-string tone, so the demo exercises real pitch detection. */
function synthesize(spec: Array<[string, number, number]>): Float32Array {
  const harmonics = [0.35, 1.0, 0.65, 0.4, 0.22, 0.12];
  const totalMs = spec.reduce((t, [, d, g]) => t + d + g, 0) + 400;
  const out = new Float32Array(Math.ceil((totalMs / 1000) * SR));
  let cursor = 0;
  for (const [name, durationMs, gapMs] of spec) {
    const hz = midiToFrequency(nameToMidi(name));
    const count = Math.floor((durationMs / 1000) * SR);
    for (let i = 0; i < count; i++) {
      const t = i / SR;
      const envelope = Math.min(1, t / 0.005) * Math.exp(-t / 0.45);
      let value = 0;
      for (let k = 0; k < harmonics.length; k++) {
        value += harmonics[k]! * Math.sin(2 * Math.PI * hz * (k + 1) * t);
      }
      out[cursor + i] = (out[cursor + i] ?? 0) + value * 0.22 * envelope;
    }
    cursor += count + Math.floor((gapMs / 1000) * SR);
  }
  return out;
}

function take(names: string[], durationMs: number, restAfterMs: number): Array<[string, number, number]> {
  return names.map((name, i) => [name, durationMs, i === names.length - 1 ? restAfterMs : 40]);
}

async function main(): Promise<void> {
  const session = new SketchbookSession({ audio: { sampleRate: SR, retainAudio: true } });

  heading('1. You play for a while. Nobody presses record.');

  // A riff, a detour, a variation on the riff, then the riff again — cleaner.
  const performance = [
    ...take(['E2', 'G2', 'A2', 'B2', 'G2', 'E2'], 260, 1300),
    ...take(['C3', 'D3', 'E3', 'G3'], 240, 1500),
    ...take(['E2', 'G2', 'A2', 'C3', 'B2', 'G2'], 260, 1400),
    ...take(['E2', 'G2', 'A2', 'B2', 'G2', 'E2'], 265, 900),
  ];

  const audio = synthesize(performance);
  for (let offset = 0; offset < audio.length; offset += 512) {
    session.feedAudio(audio.subarray(offset, Math.min(offset + 512, audio.length)));
  }
  session.flush();

  console.log(`  ${(audio.length / SR).toFixed(1)}s of playing → ${session.memory.size} notes detected from the audio.`);
  console.log(`  Carved into ${session.phrases().length} musical ideas.`);

  heading('2. "Wait — what was that thing I just played?"');
  const recall = await session.whatDidIJustPlay();
  if (!recall) throw new Error('nothing was heard');
  said(recall.say);

  heading('3. "Show me the tab."');
  console.log(recall.analysis.tab.split('\n').map((l) => `  ${l}`).join('\n'));

  heading('4. "What scale am I accidentally using? Why does this sound sad?"');
  said(renderExplanation(explainPhrase(recall.analysis)));
  console.log();
  said(renderExplanation(explainMood(recall.analysis)));

  heading('5. "What changed between the first and second version?"');
  console.log(
    renderDiff(recall.takes[0]!.phrase.notes, recall.takes[1]!.phrase.notes, ['Take 1', 'Take 2'])
      .split('\n').map((l) => `  ${l}`).join('\n'),
  );

  heading('6. "Save it." — and it becomes Version A, never overwritten.');
  const riff = await session.saveRiff(recall.cleanest, { name: 'Late Night Thing' });
  await session.saveAsVersion(riff.id, recall.takes[1]!.phrase, 'the one with the C');
  const saved = (await session.library.getRiff(riff.id))!;
  for (const version of saved.versions) {
    console.log(`  ${version.label}: ${version.notes.map((n) => midiToName(n.midi)).join(' → ')}` +
      (version.comment ? `  (${version.comment})` : ''));
  }
  console.log(`  Audio kept for Version A: ${saved.versions[0]!.audioRef ? 'yes' : 'no'}`);

  heading('7. "Give me three ways to finish this."');
  for (const ending of suggestEndings(recall.analysis)) {
    console.log(`  ${ending.label}: ${ending.notes.map((n) => midiToName(n.midi)).join(' → ')}`);
    console.log(`    \x1b[2m${ending.description}\x1b[0m`);
  }

  heading('8. "Give me another riff that answers this one. What chord sits underneath?"');
  const answer = suggestAnswer(recall.analysis);
  if (answer) console.log(`  ANSWER: ${answer.notes.map((n) => midiToName(n.midi)).join(' → ')}`);
  for (const chord of suggestChords(recall.analysis)) console.log(`  ${chord.label}: ${chord.description}`);

  heading('9. "Play Riff 01." — practice mode, against your own riff.');
  const reference = (await session.library.originalVersion(riff.id)).notes;
  const attempt: NoteEvent[] = ['E2', 'G2', 'A2', 'G2', 'G2', 'E2'].map((name, i) => ({
    midi: nameToMidi(name), startMs: i * 330, durationMs: 260, confidence: 0.9,
  }));
  console.log(`  You played: ${attempt.map((n) => midiToName(n.midi)).join(' → ')}`);
  said(practiceAttempt(reference, attempt).feedback.join('\n'));

  heading('10. Your musical fingerprint, after a few more sessions.');
  const history = [
    reference,
    recall.takes[1]!.phrase.notes,
    seqOf(['A2', 'C3', 'D3', 'C3', 'A2']),
    seqOf(['E2', 'G2', 'B2', 'G2', 'E2']),
    seqOf(['E2', 'A2', 'B2', 'A2', 'E2']),
    seqOf(['D3', 'F3', 'G3', 'F3', 'D3']),
  ];
  const fingerprint = buildFingerprint(history);
  for (const line of describeFingerprint(fingerprint)) console.log(`  • ${line}`);
  const departure = suggestDeparture(fingerprint);
  if (departure) {
    console.log();
    said(departure);
  }

  heading('11. Weeks later, you wander back into it without noticing.');
  const later = new SketchbookSession({ library: session.library });
  later.addNotes(seqOf(['E2', 'G2', 'A2', 'B2', 'G2', 'E2'], 300));
  later.memory.tick(2500);

  // Volunteered, not asked for — and only once, however long you keep playing.
  for (const match of await later.newEchoes()) {
    said(`That sounded a lot like "${match.riffName}" — ` +
      `${Math.round(match.similarity * 100)}% the same idea.`);
  }
  const again = await later.newEchoes();
  console.log(`  (asked again a moment later: ${again.length} — it says it once and lets it go)`);

  heading('12. Two riffs become a song idea.');
  const second = await session.library.saveRiff(seqOf(['A2', 'C3', 'D3', 'C3', 'A2']), { name: 'Nylon Idea' });
  let song = await session.library.createSong('Song Idea 01');
  song = await session.library.addToSong(song.id, 'verse', riff.id);
  song = await session.library.addToSong(song.id, 'chorus', second.id);
  for (const section of song.sections) {
    const part = await session.library.getRiff(section.riffId);
    console.log(`  ${section.role.padEnd(10)} ${part?.name}`);
  }

  const verseNotes = (await session.library.currentVersion(riff.id)).notes;
  const chorusNotes = (await session.library.currentVersion(second.id)).notes;
  const relation = explainRelation(verseNotes, chorusNotes);
  if (relation) {
    console.log();
    said(renderExplanation(relation, false));
  }
  const arrangement = await session.library.songNotes(song.id);
  console.log(`\n  Played end to end, that is ${arrangement.length} notes over ` +
    `${((arrangement[arrangement.length - 1]!.startMs - arrangement[0]!.startMs) / 1000).toFixed(1)}s.`);

  console.log();
}

function seqOf(names: string[], stepMs = 400): NoteEvent[] {
  return names.map((name, i) => ({
    midi: nameToMidi(name), startMs: i * stepMs, durationMs: stepMs - 70, confidence: 0.95,
  }));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
