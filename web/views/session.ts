/**
 * Live Coach.
 *
 * The app should feel less like a database and more like another musician in
 * the room: show what it hears now, remember the progression, react after a
 * phrase settles, and give the player one useful thing to try next.
 */

import type { Frame } from '../../src/audio/noteTracker.ts';
import type { Phrase, RecognitionMatch } from '../../src/types.ts';
import { frequencyToMidi, midiToName, pcToName } from '../../src/music/notes.ts';
import { suggestEndings } from '../../src/create/suggest.ts';
import type { ChordDetection } from '../audio/chordDetect.ts';
import { h, clear, relativeTime, replace } from '../ui/dom.ts';
import { button, empty, noteRow, highlightNote } from '../ui/render.ts';
import { recallPanel } from './recall.ts';
import type { AppContext, View } from './context.ts';

const MOTIF_HUES = [168, 38, 280, 200, 12, 320, 90];

interface HeardChord extends ChordDetection { heardAt: number; }

export function sessionView(context: AppContext): View {
  let recallHost = h('div', { class: 'recall-host' });
  let lastPhraseSignature = '';
  let lastCoachedPhraseId = '';
  let voiceEnabled = false;
  let lastSpokenAt = 0;
  let disposed = false;
  let checking = false;
  const chordHistory: HeardChord[] = [];

  const noteReadout = h('div', { class: 'readout-note', text: '—' });
  const chordReadout = h('div', { class: 'live-chord-value', text: '—' });
  const chordConfidence = h('span', { class: 'muted', text: 'waiting for a chord' });
  const progression = h('div', { class: 'live-progression muted', text: 'Your chord progression will build here.' });
  const centsBar = h('div', { class: 'cents-fill' });
  const centsLabel = h('div', { class: 'cents-label', text: '' });
  const levelFill = h('div', { class: 'level-fill' });
  const timeline = h('div', { class: 'timeline' });
  const timelineNote = h('p', { class: 'timeline-note muted' });
  const echoHost = h('div', { class: 'echo-host' });
  const noteStream = h('div', { class: 'note-stream' });
  const coachFeed = h('div', { class: 'live-coach-feed', 'aria-live': 'polite' });

  const listenButton = button(
    context.listening ? 'Stop listening' : 'Start Live Coach',
    async () => {
      if (context.listening) await context.stopListening();
      else await context.startListening();
    },
    'btn-primary btn-listen',
  );

  const voiceButton = button('Voice feedback: off', () => {
    voiceEnabled = !voiceEnabled;
    voiceButton.textContent = `Voice feedback: ${voiceEnabled ? 'on' : 'off'}`;
    voiceButton.classList.toggle('is-live', voiceEnabled);
    if (voiceEnabled) {
      speak('Voice coach is on. Play something and give me a little space between ideas.');
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, 'btn-quiet');

  const askButton = button('Break down what I just played', async () => {
    const recall = await context.session.whatDidIJustPlay();
    if (!recall) {
      context.say('Nothing to go on yet — play a few notes first.');
      return;
    }
    replace(recallHost, recallPanel(context, recall));
    recallHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 'btn-primary btn-ask');

  const labButton = button('Open Riff Lab', () => context.navigate('lab'), 'btn-quiet');

  const element = h('div', { class: 'view view-session live-coach-view' },
    h('section', { class: 'panel live-coach-hero' },
      h('div', { class: 'live-coach-copy' },
        h('p', { class: 'lab-kicker', text: 'LIVE COACH' }),
        h('h2', { text: 'Play. I’ll keep up.' }),
        h('p', { class: 'muted', text: 'Single notes, likely chords, recurring ideas and your recent progression stay visible while you play. The coach waits for musical pauses before reacting.' }),
      ),
      h('div', { class: 'live-coach-actions' }, listenButton, voiceButton, labButton),
    ),

    h('section', { class: 'live-hearing-grid' },
      h('article', { class: 'panel live-hearing-card' },
        h('span', { class: 'live-hearing-label', text: 'NOTE' }),
        h('div', { class: 'readout' },
          noteReadout,
          h('div', { class: 'cents' }, h('div', { class: 'cents-track' }, centsBar), centsLabel),
        ),
        h('div', { class: 'level' }, levelFill),
      ),
      h('article', { class: 'panel live-hearing-card chord-card' },
        h('span', { class: 'live-hearing-label', text: 'CHORD' }),
        chordReadout,
        chordConfidence,
      ),
      h('article', { class: 'panel live-hearing-card progression-card' },
        h('span', { class: 'live-hearing-label', text: 'PROGRESSION' }),
        progression,
      ),
    ),

    h('section', { class: 'panel live-coach-panel' },
      h('div', { class: 'live-coach-panel-head' },
        h('div', {}, h('h2', { text: 'Coach' }), h('p', { class: 'muted', text: 'Short reactions you can actually use before the next thing you play.' })),
        askButton,
      ),
      coachFeed,
      echoHost,
      h('details', { class: 'section live-details' },
        h('summary', { text: 'What the note detector is hearing' }), noteStream,
      ),
    ),

    h('section', { class: 'panel' },
      h('h2', { text: 'Your last minute' }),
      h('p', { class: 'muted', text: 'Each block is a phrase. Repeated colors mean you came back to a similar idea. Tap one to break it down.' }),
      timeline,
      h('div', { class: 'timeline-scale' }, h('span', { text: 'a minute ago' }), h('span', { text: 'now' })),
      timelineNote,
    ),
    recallHost,
  );

  addCoach('I’m ready. Start Live Coach and play normally. I’ll wait for pauses instead of talking over you.', 'hello');

  function speak(text: string): void {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    const now = Date.now();
    if (now - lastSpokenAt < 1800) return;
    lastSpokenAt = now;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.pitch = 0.96;
    utterance.volume = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  function addCoach(text: string, kind = 'observation', action?: HTMLElement): void {
    const turn = h('article', { class: `live-coach-turn is-${kind}` },
      h('span', { class: 'live-coach-avatar', text: '✦' }),
      h('div', { class: 'live-coach-turn-body' }, h('p', { text }), action ?? null),
    );
    coachFeed.appendChild(turn);
    while (coachFeed.children.length > 6) coachFeed.firstElementChild?.remove();
    turn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (kind !== 'hello') speak(text);
  }

  function renderNoteStream(): void {
    const notes = context.session.memory.all().slice(-30);
    clear(noteStream);
    if (notes.length === 0) {
      noteStream.appendChild(empty(context.listening ? 'Listening. Play something.' : 'Press Start Live Coach, then play.'));
      return;
    }
    for (const note of notes) noteStream.appendChild(h('span', { class: 'chip', text: midiToName(note.midi) }));
  }

  function renderTimeline(): void {
    const phrases = context.session.phrases();
    const motifs = context.session.motifs();
    const colourOf = new Map<string, number>();
    motifs.forEach((motif, index) => {
      for (const take of motif.takes) colourOf.set(take.id, motif.takes.length > 1 ? MOTIF_HUES[index % MOTIF_HUES.length]! : -1);
    });

    clear(timeline);
    timelineNote.textContent = '';
    if (phrases.length === 0) {
      timeline.appendChild(empty('No settled phrase yet. Play an idea, then leave a short pause.'));
      return;
    }

    const repeated = motifs.filter((m) => m.takes.length > 1);
    if (repeated.length) timelineNote.textContent = repeated.map((m) => `One idea came back ${m.takes.length} times.`).join(' ');

    const now = context.session.currentTimeMs;
    const windowMs = Math.max(1, context.session.memory.windowMs);
    const oldest = now - windowMs;
    for (const phrase of phrases) {
      const hue = colourOf.get(phrase.id) ?? -1;
      const left = ((phrase.startMs - oldest) / windowMs) * 100;
      const width = Math.max(3, ((phrase.endMs - phrase.startMs) / windowMs) * 100);
      timeline.appendChild(h('button', {
        class: `phrase-block${hue >= 0 ? ' is-motif' : ''}`,
        type: 'button',
        style: `left:${Math.max(0, left)}%;width:${width}%;${hue >= 0 ? `--hue:${hue}` : ''}`,
        title: phrase.notes.map((n) => midiToName(n.midi)).join(' → '),
        onClick: () => { void showPhrase(phrase); },
      }, h('span', { class: 'phrase-label', text: String(phrase.notes.length) })));
    }
  }

  function showEcho(match: RecognitionMatch): void {
    addCoach(
      `Hold on — that sounded a lot like ${match.riffName ?? 'a riff you saved'} from ${relativeTime(match.createdAt)}. You came back to the same musical shape without asking the app for it.`,
      'memory',
      button('Open that riff', () => context.navigate('library', { riff: match.riffId }), 'btn-quiet'),
    );
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

  async function coachLatestPhrase(): Promise<void> {
    const phrases = context.session.phrases();
    const latest = phrases[phrases.length - 1];
    if (!latest || latest.id === lastCoachedPhraseId || latest.notes.length < 3) return;
    lastCoachedPhraseId = latest.id;
    const recall = await context.session.recallPhrase(latest.id);
    if (!recall || disposed) return;
    const a = recall.analysis;
    const home = pcToName(a.homePc);
    let text = `I heard that. ${home} is acting like home.`;
    if (a.scale.confidence >= 0.55) text += ` You’re sitting pretty comfortably inside ${a.scale.label}.`;
    if (a.resolution === 'up') text += ' You climbed at the end, so the phrase still feels like it wants another sentence.';
    else if (a.resolution === 'down') text += ' You came down at the end, which makes it feel more settled.';
    else text += ' You ended close to where you started, so it feels loopable.';

    const endings = suggestEndings(a, { tuning: context.session.tuning });
    const darker = endings.find((x) => x.kind === 'darker') ?? endings[0];
    let action: HTMLElement | undefined;
    if (darker) {
      const row = noteRow(darker.notes);
      action = h('div', { class: 'live-coach-inline-action' },
        button('Hear something to try', async () => {
          await context.player.play(darker.notes, {
            onNote: (index) => highlightNote(row, index),
            onEnd: () => highlightNote(row, null),
          });
        }, 'btn-quiet'),
        row,
      );
      text += ` I’ve got one little answer you can try without changing the thing you just made.`;
    }
    addCoach(text, 'phrase', action);
  }

  function update(): void {
    listenButton.textContent = context.listening ? 'Stop listening' : 'Start Live Coach';
    listenButton.classList.toggle('is-live', context.listening);
    askButton.disabled = context.session.memory.size === 0;
    renderNoteStream();
    const signature = context.session.phrases().map((p) => p.id).join('|');
    if (signature !== lastPhraseSignature) {
      lastPhraseSignature = signature;
      renderTimeline();
      void coachLatestPhrase();
    }
  }

  function onFrame(frame: Frame): void {
    if (frame.hz > 0 && frame.clarity > 0.7) {
      const midi = frequencyToMidi(frame.hz);
      const cents = Math.round((midi - Math.round(midi)) * 100);
      noteReadout.textContent = midiToName(Math.round(midi));
      centsBar.style.left = `${50 + Math.max(-50, Math.min(50, cents))}%`;
      centsBar.style.transform = 'translateX(-50%)';
      centsLabel.textContent = Math.abs(cents) <= 5 ? 'in tune' : `${Math.abs(cents)}¢ ${cents > 0 ? 'sharp' : 'flat'}`;
      centsLabel.classList.toggle('is-good', Math.abs(cents) <= 5);
    } else {
      noteReadout.textContent = '—';
      centsLabel.textContent = '';
      centsLabel.classList.remove('is-good');
    }
    levelFill.style.width = `${Math.min(100, frame.rms * 320)}%`;
  }

  function chordReaction(previous: HeardChord | undefined, chord: HeardChord): string | null {
    if (!previous) return `That sounds like ${chord.label}. I’ll keep listening before I call it a progression.`;
    if (previous.label === chord.label) return null;
    const distance = ((chord.rootPc - previous.rootPc) % 12 + 12) % 12;
    if (distance === 5 || distance === 7) return `${previous.label} → ${chord.label}. Nice. That root movement is strong and guitar-friendly — it sounds connected without sounding static.`;
    if (distance === 3 || distance === 4 || distance === 8 || distance === 9) return `${previous.label} → ${chord.label}. That changed the color more than the distance makes it seem. Let that second chord ring for a second before you move again.`;
    return `${previous.label} → ${chord.label}. I’m following you. Try repeating that move once so we can hear whether it feels like a home base or just a passing color.`;
  }

  function onChord(chord: ChordDetection): void {
    chordReadout.textContent = chord.label;
    chordConfidence.textContent = `${Math.round(chord.confidence * 100)}% · likely chord`;
    const previous = chordHistory[chordHistory.length - 1];
    if (previous?.label === chord.label) return;
    const heard: HeardChord = { ...chord, heardAt: Date.now() };
    chordHistory.push(heard);
    while (chordHistory.length > 8) chordHistory.shift();
    progression.textContent = chordHistory.map((x) => x.label).join('  →  ');
    const reaction = chordReaction(previous, heard);
    if (reaction && (!previous || Date.now() - previous.heardAt > 500)) addCoach(reaction, 'chord');
  }

  const timer = window.setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      renderTimeline();
      await coachLatestPhrase();
      const echoes = await context.session.newEchoes();
      if (!disposed) echoes.forEach(showEcho);
    } catch (error) {
      if (!disposed) context.say((error as Error).message, 'error');
    } finally {
      checking = false;
    }
  }, 650);

  update();
  return {
    element,
    update,
    onNotes: update,
    onFrame,
    onChord,
    dispose() {
      disposed = true;
      window.clearInterval(timer);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    },
  };
}
