/**
 * Practice Mode — the app teaching you your own riff.
 *
 * You pick a version, it plays it to you, you play it back, and it tells you
 * what happened in the words another player would use. The attempt is captured
 * from the live session, so this only works while the app is listening.
 */

import type { NoteEvent, Riff, RiffVersion } from '../../src/types.ts';
import { buildPracticePlan, practiceAttempt, practiceVersion } from '../../src/practice/practice.ts';
import type { PracticeTarget } from '../../src/practice/practice.ts';
import { renderDiff } from '../../src/phrase/diff.ts';
import { h, clear, replace } from '../ui/dom.ts';
import { button, highlightNote, noteRow } from '../ui/render.ts';
import type { AppContext } from './context.ts';

/** How long a silence ends an attempt. Long enough to think, short enough to feel live. */
const ATTEMPT_TIMEOUT_MS = 2000;

export function practicePanel(context: AppContext, riff: Riff, version: RiffVersion): HTMLElement & { dispose(): void } {
  let speed = 1;
  let target: PracticeTarget = version.parentId === null ? 'original' : 'latest';
  let capturing = false;
  let captured: NoteEvent[] = [];
  let silenceTimer: number | null = null;
  let stopCapture: (() => void) | null = null;
  let selected = practiceVersion(riff, target);
  let attemptPlan = buildPracticePlan(selected, target, speed);

  const status = h('p', { class: 'practice-status', text: 'Play it once to hear it, then try it yourself.' });
  const result = h('div', { class: 'practice-result' });
  let referenceRow = noteRow(selected.notes);
  const title = h('h3', { text: '' });
  const controls: HTMLButtonElement[] = [];

  const speedButtons = h('div', { class: 'speed-row' },
    ...[1, 0.75, 0.5].map((value) => {
      const control = h('button', {
        class: `chip-btn${value === speed ? ' is-on' : ''}`,
        type: 'button',
        text: value === 1 ? 'Full speed' : `${Math.round(value * 100)}%`,
        onClick: () => {
          if (capturing) return;
          speed = value;
          for (const node of speedButtons.querySelectorAll('.chip-btn')) node.classList.remove('is-on');
          control.classList.add('is-on');
        },
      });
      controls.push(control);
      return control;
    }),
  );

  // If there is a recording of this version, offer the real thing too —
  // slowed properly, so the pitch does not sag when you take it down to 50%.
  const recordingRow = h('div', { class: 'practice-actions' });
  async function renderRecording(): Promise<void> {
    clear(recordingRow);
    const take = selected;
    if (!take.audioRef) return;
    const live = context.session.getClip(take.audioRef);
    const stored = live ? null : await context.clips.get(take.audioRef);
    if (selected !== take) return;
    const samples = live ?? stored?.samples;
    if (!samples || samples.length === 0) return;
    const rate = live ? context.sampleRate : stored?.sampleRate ?? context.sampleRate;

    recordingRow.appendChild(button('Play my actual recording', async () => {
      if (capturing) return;
      status.textContent = speed === 1
        ? 'This is you, the day you played it.'
        : `This is your own recording at ${Math.round(speed * 100)}% — same pitch, just slower.`;
      await context.player.playSamples(samples, rate, speed);
    }, 'btn-quiet'));
  }

  const hearButton = button('Play it to me', async () => {
    if (capturing) return;
    const plan = buildPracticePlan(selected, target, speed);
    status.textContent = `Playing ${plan.label}. Listen, then try it.`;
    await context.player.play(plan.notes, {
      onNote: (index) => highlightNote(referenceRow, index),
      onEnd: () => highlightNote(referenceRow, null),
    });
    status.textContent = 'Now you. Press "I\'ll try it" and play.';
  }, 'btn-primary');

  function finishAttempt(): void {
    if (!capturing) return;
    capturing = false;
    stopCapture?.();
    stopCapture = null;
    if (silenceTimer !== null) window.clearTimeout(silenceTimer);
    silenceTimer = null;
    tryButton.textContent = "I'll try it";
    tryButton.classList.remove('is-live');
    targetSelect.disabled = false;
    hearButton.disabled = false;
    controls.forEach((control) => { control.disabled = false; });

    if (captured.length === 0) {
      status.textContent = "I didn't hear anything that time — give it another go.";
      return;
    }

    const attempt = [...captured];
    const reference = attemptPlan.notes;
    const outcome = practiceAttempt(reference, attempt);
    status.textContent = `${Math.round(outcome.accuracy * 100)}% of the notes matched.`;

    replace(result,
      h('div', { class: `coaching${outcome.nailed ? ' is-nailed' : ''}` },
        ...outcome.feedback.map((line) => h('p', { text: line })),
      ),
      h('details', { class: 'section' },
        h('summary', { text: 'Show me note by note' }),
        h('pre', { class: 'tab', text: renderDiff(reference, attempt, ['The riff', 'You played']) }),
      ),
      h('div', { class: 'practice-actions' },
        button('Play what I did', async () => { await context.player.play(attempt); }, 'btn-quiet'),
        !outcome.nailed ? button('Actually, save mine as a new version', async () => {
          const saved = await context.library.addVersion(riff.id, attempt, {
            comment: 'from a practice run', parentId: attemptPlan.version.id,
          });
          // Deliberately not refreshing: rebuilding the library would close
          // this panel mid-practice. The new version is there when they leave.
          context.say(`Kept your take as ${saved.label}. Happy accidents count — it will be in the list when you go back.`);
        }, 'btn-quiet') : null,
      ),
    );
  }

  const tryButton = button("I'll try it", () => {
    if (capturing) { finishAttempt(); return; }
    if (!context.listening) {
      context.say('Start listening first — practice mode needs to hear you.');
      return;
    }
    captured = [];
    attemptPlan = buildPracticePlan(selected, target, speed);
    capturing = true;
    targetSelect.disabled = true;
    hearButton.disabled = true;
    controls.forEach((control) => { control.disabled = true; });
    clear(result);
    tryButton.textContent = 'Listening… (press again when done)';
    tryButton.classList.add('is-live');
    status.textContent = 'Go ahead.';

    stopCapture = context.session.onNote((note) => {
      if (!capturing) return;
      captured.push(note);
      if (silenceTimer !== null) window.clearTimeout(silenceTimer);
      silenceTimer = window.setTimeout(finishAttempt, ATTEMPT_TIMEOUT_MS);
    });
    // If nothing at all arrives, stop waiting eventually rather than hanging.
    silenceTimer = window.setTimeout(finishAttempt, ATTEMPT_TIMEOUT_MS * 3);
  }, 'btn-primary');

  const targetSelect = h('select', {
    class: 'select',
    onChange: (event: Event) => {
      target = (event.target as HTMLSelectElement).value as PracticeTarget;
      selected = practiceVersion(riff, target);
      const row = noteRow(selected.notes);
      referenceRow.replaceWith(row);
      referenceRow = row;
      title.textContent = `Practise ${riff.name ?? 'this riff'} — ${selected.label}`;
      clear(result);
      void renderRecording().catch((error: Error) => context.say(error.message, 'error'));
    },
  },
    h('option', { value: 'original', text: 'the original take' }),
    h('option', { value: 'latest', text: 'the latest take' }),
    h('option', { value: 'best', text: 'the cleanest take' }),
  );
  targetSelect.value = target;
  title.textContent = `Practise ${riff.name ?? 'this riff'} — ${selected.label}`;
  void renderRecording().catch((error: Error) => context.say(error.message, 'error'));

  const panel = h('section', { class: 'panel practice' },
    title,
    h('div', { class: 'playable' }, hearButton, referenceRow),
    h('div', { class: 'practice-controls' },
      h('label', { class: 'field' }, 'Practise against ', targetSelect),
      h('label', { class: 'field' }, 'Speed ', speedButtons),
    ),
    h('p', { class: 'muted', text: 'Slowing down changes the timing only — the pitch stays where it is.' }),
    recordingRow,
    h('div', { class: 'practice-actions' }, tryButton),
    status,
    result,
  );
  return Object.assign(panel, { dispose() {
    capturing = false;
    stopCapture?.();
    stopCapture = null;
    if (silenceTimer !== null) window.clearTimeout(silenceTimer);
  } });
}
