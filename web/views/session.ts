/**
 * The listening screen.
 *
 * Most of the time this should be quiet and out of the way — you are playing
 * guitar, not using an app. It shows what it is hearing, draws the ideas it has
 * picked out, and keeps one big button ready for the moment you look up and ask
 * what you just played.
 */

import type { Frame } from '../../src/audio/noteTracker.ts';
import type { Phrase, RecognitionMatch } from '../../src/types.ts';
import { frequencyToMidi, midiToName } from '../../src/music/notes.ts';
import { h, clear, relativeTime, replace } from '../ui/dom.ts';
import { button, empty } from '../ui/render.ts';
import { recallPanel } from './recall.ts';
import type { AppContext, View } from './context.ts';

/** Distinct hues for motif groups, so a repeated idea is obvious at a glance. */
const MOTIF_HUES = [168, 38, 280, 200, 12, 320, 90];

export function sessionView(context: AppContext): View {
  let recallHost = h('div', { class: 'recall-host' });
  let lastPhraseSignature = '';

  const noteReadout = h('div', { class: 'readout-note', text: '—' });
  const centsBar = h('div', { class: 'cents-fill' });
  const centsLabel = h('div', { class: 'cents-label', text: 'in tune' });
  const levelFill = h('div', { class: 'level-fill' });
  const timeline = h('div', { class: 'timeline' });
  const timelineNote = h('p', { class: 'timeline-note muted' });
  const echoHost = h('div', { class: 'echo-host' });
  const noteStream = h('div', { class: 'note-stream' });

  const listenButton = button(
    context.listening ? 'Stop listening' : 'Start listening',
    async () => {
      if (context.listening) await context.stopListening();
      else await context.startListening();
    },
    'btn-primary btn-listen',
  );

  const askButton = button('What did I just play?', async () => {
    const recall = await context.session.whatDidIJustPlay();
    if (!recall) {
      context.say('Nothing to go on yet — play a few notes first.');
      return;
    }
    replace(recallHost, recallPanel(context, recall));
    recallHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 'btn-primary btn-ask');

  const element = h('div', { class: 'view view-session' },
    h('section', { class: 'listen-bar' },
      listenButton,
      h('div', { class: 'readout' },
        noteReadout,
        h('div', { class: 'cents' }, h('div', { class: 'cents-track' }, centsBar), centsLabel),
      ),
      h('div', { class: 'level' }, levelFill),
    ),
    h('section', { class: 'panel' },
      h('div', { class: 'ask-row' }, askButton),
      h('p', { class: 'muted hint' },
        'Nothing is recorded. The last minute of what you play is held in memory ' +
        'and forgotten unless you save it.'),
      echoHost,
      noteStream,
    ),
    h('section', { class: 'panel' },
      h('h2', { text: 'Ideas it has picked out' }),
      h('p', { class: 'muted', text: 'Click any of these to ask about that one instead.' }),
      timeline,
      h('div', { class: 'timeline-scale' },
        h('span', { text: 'a minute ago' }), h('span', { text: 'now' })),
      timelineNote,
    ),
    recallHost,
  );

  function renderNoteStream(): void {
    const notes = context.session.memory.all().slice(-24);
    clear(noteStream);
    if (notes.length === 0) {
      noteStream.appendChild(empty(context.listening
        ? 'Listening. Play something.'
        : 'Press start listening, then play.'));
      return;
    }
    for (const note of notes) {
      noteStream.appendChild(h('span', { class: 'chip', text: midiToName(note.midi) }));
    }
  }

  function renderTimeline(): void {
    const phrases = context.session.phrases();
    const motifs = context.session.motifs();
    const colourOf = new Map<string, number>();
    motifs.forEach((motif, index) => {
      for (const take of motif.takes) {
        colourOf.set(take.id, motif.takes.length > 1 ? MOTIF_HUES[index % MOTIF_HUES.length]! : -1);
      }
    });

    clear(timeline);
    timelineNote.textContent = '';
    if (phrases.length === 0) {
      timeline.appendChild(empty('No complete ideas yet. Play a phrase, then pause for a moment.'));
      return;
    }

    const repeated = motifs.filter((m) => m.takes.length > 1);
    if (repeated.length) {
      timelineNote.textContent = repeated
        .map((m) => `You came back to one idea ${m.takes.length} times.`)
        .join(' ');
    }

    const now = context.session.currentTimeMs;
    const windowMs = Math.max(1, context.session.memory.windowMs);
    const oldest = now - windowMs;

    for (const phrase of phrases) {
      const hue = colourOf.get(phrase.id) ?? -1;
      const left = ((phrase.startMs - oldest) / windowMs) * 100;
      const width = Math.max(3, ((phrase.endMs - phrase.startMs) / windowMs) * 100);
      const block = h('button', {
        class: `phrase-block${hue >= 0 ? ' is-motif' : ''}`,
        type: 'button',
        style: `left:${Math.max(0, left)}%;width:${width}%;${hue >= 0 ? `--hue:${hue}` : ''}`,
        title: `${phrase.notes.map((n) => midiToName(n.midi)).join(' → ')}`,
        onClick: () => showPhrase(phrase),
      }, h('span', { class: 'phrase-label', text: String(phrase.notes.length) }));
      timeline.appendChild(block);
    }
  }

  /**
   * Shown, never spoken over: a quiet line the player can take or dismiss.
   * The session only ever offers each riff once, so this cannot pile up.
   */
  function showEcho(match: RecognitionMatch): void {
    const notice = h('div', { class: 'echo' },
      h('p', {},
        'That sounded a lot like ',
        h('strong', { text: match.riffName ?? 'a riff you saved' }),
        ` from ${relativeTime(match.createdAt)}.`,
      ),
      h('div', { class: 'echo-actions' },
        button('Show me it', () => {
          context.navigate('library', { riff: match.riffId });
        }, 'btn-quiet'),
        button('Not now', () => notice.remove(), 'btn-quiet'),
      ),
    );
    echoHost.appendChild(notice);
  }

  async function showPhrase(phrase: Phrase): Promise<void> {
    const recall = await context.session.recallPhrase(phrase.id);
    if (!recall) {
      context.say('That idea has aged out of the session memory.');
      return;
    }
    replace(recallHost, recallPanel(context, recall));
    recallHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function update(): void {
    listenButton.textContent = context.listening ? 'Stop listening' : 'Start listening';
    listenButton.classList.toggle('is-live', context.listening);
    askButton.disabled = context.session.memory.size === 0;

    renderNoteStream();
    // Redrawing the timeline on every note would fight with clicking it, so
    // only redraw when the set of ideas has actually changed.
    const signature = context.session.phrases().map((p) => p.id).join('|');
    if (signature !== lastPhraseSignature) {
      lastPhraseSignature = signature;
      renderTimeline();
      // A finished idea is the only moment worth checking, and the session
      // decides whether it is worth mentioning at all.
      void context.session.newEchoes().then((echoes) => echoes.forEach(showEcho));
    }
  }

  function onFrame(frame: Frame): void {
    if (frame.hz > 0 && frame.clarity > 0.7) {
      const midi = frequencyToMidi(frame.hz);
      const cents = Math.round((midi - Math.round(midi)) * 100);
      noteReadout.textContent = midiToName(Math.round(midi));
      centsBar.style.transform = `translateX(${Math.max(-50, Math.min(50, cents))}%)`;
      centsLabel.textContent = Math.abs(cents) <= 5
        ? 'in tune'
        : `${Math.abs(cents)} cents ${cents > 0 ? 'sharp' : 'flat'}`;
      centsLabel.classList.toggle('is-good', Math.abs(cents) <= 5);
    } else {
      noteReadout.textContent = '—';
      centsLabel.textContent = '';
      centsLabel.classList.remove('is-good');
    }
    levelFill.style.width = `${Math.min(100, frame.rms * 320)}%`;
  }

  update();
  return { element, update, onNotes: update, onFrame };
}
