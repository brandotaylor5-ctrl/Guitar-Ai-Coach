/**
 * Live Coach is the front door. The hierarchy is intentionally simple:
 * what I hear -> what it probably means -> one thing worth trying next.
 */

import type { Frame } from '../../src/audio/noteTracker.ts';
import type { Phrase, RecognitionMatch } from '../../src/types.ts';
import { frequencyToMidi, midiToName, pcToName } from '../../src/music/notes.ts';
import { suggestEndings } from '../../src/create/suggest.ts';
import { diffTakes } from '../../src/phrase/diff.ts';
import { motifContaining } from '../../src/phrase/motif.ts';
import type { ChordDetection } from '../audio/chordDetect.ts';
import { h, clear, relativeTime, replace } from '../ui/dom.ts';
import { button, empty, noteRow, highlightNote } from '../ui/render.ts';
import { recallPanel } from './recall.ts';
import type { AppContext, View } from './context.ts';

const MOTIF_HUES = [168, 38, 280, 200, 12, 320, 90];
interface HeardChord extends ChordDetection { heardAt: number; }
interface CenterGuess { rootPc: number; minor: boolean; confidence: number; }

const MAJOR_CHORDS: Array<[number, 'major'|'minor']> = [[0,'major'],[2,'minor'],[4,'minor'],[5,'major'],[7,'major'],[9,'minor']];
const MINOR_CHORDS: Array<[number, 'major'|'minor']> = [[0,'minor'],[3,'major'],[5,'minor'],[7,'minor'],[8,'major'],[10,'major']];

function qualityFamily(q: ChordDetection['quality']): 'major'|'minor'|'open' {
  if (q === 'minor' || q === 'm7') return 'minor';
  if (q === 'major' || q === '7' || q === 'maj7') return 'major';
  return 'open';
}

function inferCenter(chords: HeardChord[]): CenterGuess | null {
  const recent = chords.slice(-6);
  if (recent.length < 2) return null;
  let best: CenterGuess & { score: number } | null = null;
  for (let rootPc = 0; rootPc < 12; rootPc++) {
    for (const minor of [false, true]) {
      const map = minor ? MINOR_CHORDS : MAJOR_CHORDS;
      let score = 0;
      for (let i = 0; i < recent.length; i++) {
        const chord = recent[i]!;
        const rel = (chord.rootPc - rootPc + 12) % 12;
        const expected = map.find(([pc]) => pc === rel)?.[1];
        if (!expected) { score -= .55; continue; }
        score += 1;
        const family = qualityFamily(chord.quality);
        if (family === expected) score += .45;
        else if (family !== 'open') score -= .2;
        if (rel === 0) score += i === recent.length - 1 ? .5 : .25;
      }
      const confidence = Math.max(0, Math.min(1, score / Math.max(2, recent.length * 1.35)));
      if (!best || score > best.score) best = { rootPc, minor, confidence, score };
    }
  }
  return best && best.confidence >= .42 ? best : null;
}

function nextChordIdea(center: CenterGuess | null, last: HeardChord | undefined): string | null {
  if (!center || !last) return null;
  const rel = (last.rootPc - center.rootPc + 12) % 12;
  if (center.minor) {
    const options = rel === 0 ? [8,10] : rel === 8 ? [10,0] : rel === 10 ? [0,8] : [0,10];
    return `${pcToName((center.rootPc + options[0]!) % 12)}${options[0] === 0 ? 'm' : ''}`;
  }
  const options = rel === 0 ? [5,7] : rel === 5 ? [7,0] : rel === 7 ? [0,9] : [0,7];
  const next = options[0]!;
  return `${pcToName((center.rootPc + next) % 12)}${next === 9 ? 'm' : ''}`;
}

function lowerFirst(sentence: string): string {
  if (!sentence) return sentence;
  return sentence.charAt(0).toLowerCase() + sentence.slice(1);
}

export function sessionView(context: AppContext): View {
  let recallHost = h('div', { class: 'recall-host' });
  let lastPhraseSignature = '';
  let lastCoachedPhraseId = '';
  /** When a note was last heard, so the coach can tell playing from pausing. */
  let lastNoteAt = 0;
  let voiceEnabled = false;
  let lastSpokenAt = 0;
  let disposed = false;
  let checking = false;
  const chordHistory: HeardChord[] = [];

  const noteReadout = h('div', { class: 'readout-note', text: '—' });
  const chordReadout = h('div', { class: 'live-chord-value', text: '—' });
  const chordConfidence = h('span', { class: 'muted', text: 'waiting for a chord' });
  const centerReadout = h('div', { class: 'live-center-value', text: '—' });
  const centerHint = h('span', { class: 'muted', text: 'I need a couple chord changes first.' });
  const progression = h('div', { class: 'live-progression muted', text: 'Your chord progression will build here.' });
  const tryNext = h('div', { class: 'live-try-next muted', text: 'Play an idea. When there is something useful to try, I’ll put it here.' });
  const centsBar = h('div', { class: 'cents-fill' });
  const centsLabel = h('div', { class: 'cents-label', text: '' });
  const levelFill = h('div', { class: 'level-fill' });
  const timeline = h('div', { class: 'timeline' });
  const timelineNote = h('p', { class: 'timeline-note muted' });
  const coachFeed = h('div', { class: 'live-coach-feed', 'aria-live': 'polite' });
  const echoHost = h('div', { class: 'echo-host' });
  const noteStream = h('div', { class: 'note-stream' });

  const listenButton = button(context.listening ? 'Stop listening' : 'Start Live Coach', async () => {
    if (context.listening) await context.stopListening(); else await context.startListening();
  }, 'btn-primary btn-listen');

  const voiceButton = button('Voice feedback: off', () => {
    voiceEnabled = !voiceEnabled;
    voiceButton.textContent = `Voice feedback: ${voiceEnabled ? 'on' : 'off'}`;
    voiceButton.classList.toggle('is-live', voiceEnabled);
    // Spoken directly rather than through the gate: this one is a reply to a
    // button press, so it should be immediate and is not an interruption.
    if (voiceEnabled && 'speechSynthesis' in window) {
      lastSpokenAt = Date.now();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(
        'Voice coach on. I will listen while you play and speak when you pause.',
      ));
    }
    else if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, 'btn-quiet');

  const askButton = button('Break down what I just played', async () => {
    const recall = await context.session.whatDidIJustPlay();
    if (!recall) { context.say('Nothing to go on yet — play a few notes first.'); return; }
    replace(recallHost, recallPanel(context, recall));
    recallHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 'btn-primary btn-ask');

  const element = h('div', { class: 'view view-session live-coach-view' },
    h('section', { class: 'panel live-coach-hero' },
      h('div', { class: 'live-coach-copy' },
        h('p', { class: 'lab-kicker', text: 'LIVE COACH' }),
        h('h2', { text: 'Play. I’ll keep up.' }),
        h('p', { class: 'muted', text: 'I listen for notes, chords, repeated ideas and the tiny changes between takes — then give you one thing worth trying.' }),
      ),
      h('div', { class: 'live-coach-actions' }, listenButton, voiceButton, button('Open Riff Lab', () => context.navigate('lab'), 'btn-quiet')),
    ),

    h('section', { class: 'live-hearing-grid live-hearing-grid-v3' },
      h('article', { class: 'panel live-hearing-card' },
        h('span', { class: 'live-hearing-label', text: 'NOTE' }),
        h('div', { class: 'readout' }, noteReadout, h('div', { class: 'cents' }, h('div', { class: 'cents-track' }, centsBar), centsLabel)),
        h('div', { class: 'level' }, levelFill),
      ),
      h('article', { class: 'panel live-hearing-card chord-card' }, h('span', { class: 'live-hearing-label', text: 'CHORD' }), chordReadout, chordConfidence),
      h('article', { class: 'panel live-hearing-card center-card' }, h('span', { class: 'live-hearing-label', text: 'KEY / CENTER' }), centerReadout, centerHint),
      h('article', { class: 'panel live-hearing-card progression-card' }, h('span', { class: 'live-hearing-label', text: 'PROGRESSION' }), progression),
    ),

    h('section', { class: 'panel live-next-panel' },
      h('span', { class: 'live-hearing-label', text: 'TRY THIS NEXT' }),
      tryNext,
    ),

    h('section', { class: 'panel live-coach-panel' },
      h('div', { class: 'live-coach-panel-head' },
        h('div', {}, h('h2', { text: 'Coach' }), h('p', { class: 'muted', text: 'Short reactions after musical pauses — especially when you repeat an idea and change it.' })), askButton,
      ),
      coachFeed, echoHost,
      h('details', { class: 'section live-details' }, h('summary', { text: 'Raw notes I am hearing' }), noteStream),
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

  addCoach('I’m ready. Start Live Coach and play normally. I’ll listen more than I talk.', 'hello');

  /**
   * How long the coach stays quiet after speaking, by what it has to say.
   * A remark worth interrupting for is rare; most of what it notices is not.
   */
  const COOLDOWN_MS: Record<string, number> = {
    memory: 25_000,
    variation: 30_000,
    phrase: 45_000,
  };
  /** Kinds that are never spoken aloud. They still appear in the feed. */
  const SILENT_KINDS = new Set(['chord', 'hello', 'observation']);
  /** A pause this long means the player has stopped, rather than drawn breath. */
  const PAUSE_BEFORE_SPEAKING_MS = 1_800;

  function speak(text: string, kind: string): void {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    if (SILENT_KINDS.has(kind)) return;

    const now = Date.now();
    // Never talk over playing. The whole point is that it listens while you
    // play and speaks when you stop — a coach in the room would not narrate
    // your chord changes back to you while your hands are moving.
    if (now - lastNoteAt < PAUSE_BEFORE_SPEAKING_MS) return;
    if (now - lastSpokenAt < (COOLDOWN_MS[kind] ?? 45_000)) return;
    // Already mid-sentence: let it finish rather than stacking up.
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) return;

    lastSpokenAt = now;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02; u.pitch = .96; u.volume = .9;
    window.speechSynthesis.speak(u);
  }

  function addCoach(text: string, kind = 'observation', action?: HTMLElement): void {
    const turn = h('article', { class: `live-coach-turn is-${kind}` },
      h('span', { class: 'live-coach-avatar', text: '✦' }),
      h('div', { class: 'live-coach-turn-body' }, h('p', { text }), action ?? null),
    );
    coachFeed.appendChild(turn);
    while (coachFeed.children.length > 7) coachFeed.firstElementChild?.remove();
    speak(text, kind);
  }

  function renderNoteStream(): void {
    clear(noteStream);
    const notes = context.session.memory.all().slice(-30);
    if (!notes.length) { noteStream.appendChild(empty(context.listening ? 'Listening. Play something.' : 'Press Start Live Coach, then play.')); return; }
    for (const note of notes) noteStream.appendChild(h('span', { class: 'chip', text: midiToName(note.midi) }));
  }

  function renderTimeline(): void {
    const phrases = context.session.phrases();
    const motifs = context.session.motifs();
    const colourOf = new Map<string, number>();
    motifs.forEach((motif, index) => motif.takes.forEach((take) => colourOf.set(take.id, motif.takes.length > 1 ? MOTIF_HUES[index % MOTIF_HUES.length]! : -1)));
    clear(timeline); timelineNote.textContent = '';
    if (!phrases.length) { timeline.appendChild(empty('No settled phrase yet. Play an idea, then leave a short pause.')); return; }
    const repeated = motifs.filter((m) => m.takes.length > 1);
    if (repeated.length) timelineNote.textContent = repeated.map((m) => `One idea came back ${m.takes.length} times.`).join(' ');
    const now = context.session.currentTimeMs, windowMs = Math.max(1, context.session.memory.windowMs), oldest = now - windowMs;
    for (const phrase of phrases) {
      const hue = colourOf.get(phrase.id) ?? -1;
      const left = ((phrase.startMs - oldest) / windowMs) * 100;
      const width = Math.max(3, ((phrase.endMs - phrase.startMs) / windowMs) * 100);
      timeline.appendChild(h('button', {
        class: `phrase-block${hue >= 0 ? ' is-motif' : ''}`, type: 'button',
        style: `left:${Math.max(0,left)}%;width:${width}%;${hue >= 0 ? `--hue:${hue}` : ''}`,
        title: phrase.notes.map((n) => midiToName(n.midi)).join(' → '),
        onClick: () => { void showPhrase(phrase); },
      }, h('span', { class: 'phrase-label', text: String(phrase.notes.length) })));
    }
  }

  function harmonyParams(center: CenterGuess | null): Record<string, string> {
    const recent = chordHistory.slice(-4);
    const fallback = recent[0];
    const rootPc = center?.rootPc ?? fallback?.rootPc ?? 4;
    const minor = center?.minor ?? (fallback ? qualityFamily(fallback.quality) === 'minor' : true);
    return {
      root: String(rootPc),
      mode: minor ? 'minor' : 'major',
      progression: recent.map((chord) => `${chord.rootPc}:${qualityFamily(chord.quality) === 'minor' ? 1 : 0}`).join(','),
    };
  }

  function sendHarmonyToLab(center: CenterGuess | null): void {
    context.navigate('lab', harmonyParams(center));
  }

  function refreshHarmony(): void {
    progression.textContent = chordHistory.length ? chordHistory.map((x) => x.label).join('  →  ') : 'Your chord progression will build here.';
    progression.classList.toggle('muted', chordHistory.length === 0);
    const center = inferCenter(chordHistory);

    if (center) {
      centerReadout.textContent = `${pcToName(center.rootPc)} ${center.minor ? 'minor' : 'major'}`;
      centerHint.textContent = `${Math.round(center.confidence*100)}% fit from the recent chords — a clue, not a rule.`;
    } else {
      centerReadout.textContent = '—';
      centerHint.textContent = chordHistory.length < 2 ? 'I need a couple chord changes first.' : 'The harmony is still ambiguous. Keep playing.';
    }

    if (!chordHistory.length) return;
    clear(tryNext);
    const next = nextChordIdea(center, chordHistory.at(-1));
    if (next) {
      tryNext.appendChild(h('span', {}, 'Try ', h('strong', { text: next }), ` after ${chordHistory.at(-1)!.label}. Repeat it once and hear whether it belongs.`));
    } else {
      tryNext.appendChild(h('span', { text: 'Keep the loop going once more so I can hear where it wants to settle.' }));
    }
    if (chordHistory.length >= 2) {
      tryNext.appendChild(button('Build a riff from these chords', () => sendHarmonyToLab(center), 'btn-primary'));
    }
  }

  function showEcho(match: RecognitionMatch): void {
    addCoach(`Hold on — that sounded a lot like ${match.riffName ?? 'a riff you saved'} from ${relativeTime(match.createdAt)}. You found the same shape again without asking for it.`, 'memory',
      button('Open that riff', () => context.navigate('library', { riff: match.riffId }), 'btn-quiet'));
  }

  async function showPhrase(phrase: Phrase): Promise<void> {
    const recall = await context.session.recallPhrase(phrase.id);
    if (!recall) { context.say('That idea has aged out of session memory.'); return; }
    replace(recallHost, recallPanel(context, recall));
    recallHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function variationReaction(latest: Phrase): boolean {
    const motif = motifContaining(context.session.motifs(), latest.id);
    if (!motif || motif.takes.length < 2) return false;
    const prior = motif.takes[motif.takes.length - 2];
    if (!prior || prior.id === latest.id) return false;

    const diff = diffTakes(prior.notes, latest.notes);
    const changedCount = diff.changes.filter((change) => change.kind !== 'kept').length;
    const tempoChanged = Math.abs(diff.tempoRatio - 1) >= .08;
    if (changedCount > 4 && !tempoChanged) return false;

    const text = diff.identical && !tempoChanged
      ? 'There — you came back to the same idea almost exactly. That repetition is starting to sound intentional.'
      : `There — same basic idea, different take: ${lowerFirst(diff.summary)}`;

    const actions = h('div', { class: 'live-coach-inline-action' },
      button('Hear the earlier take', () => { void context.player.play(prior.notes); }, 'btn-quiet'),
      button('Hear this take', () => { void context.player.play(latest.notes); }, 'btn-quiet'),
    );

    clear(tryNext);
    tryNext.append(
      h('span', { text: changedCount <= 2 ? 'Do it once more and make that change deliberate.' : 'Play both versions once. Keep the part that feels like the hook.' }),
      button('A/B the two takes', async () => {
        await context.player.play(prior.notes);
        await new Promise((resolve) => window.setTimeout(resolve, 280));
        await context.player.play(latest.notes);
      }, 'btn-primary'),
    );
    addCoach(text, 'variation', actions);
    return true;
  }

  async function coachLatestPhrase(): Promise<void> {
    const latest = context.session.phrases().at(-1);
    if (!latest || latest.id === lastCoachedPhraseId || latest.notes.length < 3) return;
    lastCoachedPhraseId = latest.id;

    if (variationReaction(latest)) return;

    const recall = await context.session.recallPhrase(latest.id);
    if (!recall || disposed) return;
    const a = recall.analysis;
    const home = pcToName(a.homePc);
    let text = `Yep — I heard that. ${home} is acting like home.`;
    if (a.scale.confidence >= .55) text += ` Those notes fit ${a.scale.label} pretty comfortably.`;
    if (a.resolution === 'up') text += ' You climbed at the end, so it still feels like it wants an answer.';
    else if (a.resolution === 'down') text += ' You came down at the end, which makes it feel more settled.';
    else text += ' You ended close to where you started, so it wants to loop.';

    const endings = suggestEndings(a, { tuning: context.session.tuning });
    const idea = endings.find((x) => x.kind === 'darker') ?? endings[0];
    let action: HTMLElement | undefined;
    if (idea) {
      const row = noteRow(idea.notes);
      action = h('div', { class: 'live-coach-inline-action' },
        button('Hear what I mean', async () => { await context.player.play(idea.notes, { onNote:(i)=>highlightNote(row,i), onEnd:()=>highlightNote(row,null) }); }, 'btn-quiet'), row);
      text += ' I made one tiny answer from your own musical context — not a random lick.';
      clear(tryNext);
      tryNext.append(
        h('strong', { text: 'Answer the phrase: ' }),
        row,
        button('Hear it', () => { void context.player.play(idea.notes); }, 'btn-quiet'),
      );
    }
    addCoach(text, 'phrase', action);
  }

  function update(): void {
    listenButton.textContent = context.listening ? 'Stop listening' : 'Start Live Coach';
    listenButton.classList.toggle('is-live', context.listening);
    askButton.disabled = context.session.memory.size === 0;
    renderNoteStream();
    const sig = context.session.phrases().map((p) => p.id).join('|');
    if (sig !== lastPhraseSignature) { lastPhraseSignature = sig; renderTimeline(); void coachLatestPhrase(); }
  }

  function onFrame(frame: Frame): void {
    // Any sound at all counts as still playing, not just clean notes — a
    // muted strum or a scrape means their hands are moving.
    if (frame.rms > 0.02) lastNoteAt = Date.now();
    if (frame.hz > 0 && frame.clarity > .7) {
      const midi = frequencyToMidi(frame.hz), cents = Math.round((midi - Math.round(midi))*100);
      noteReadout.textContent = midiToName(Math.round(midi));
      centsBar.style.left = `${50 + Math.max(-50,Math.min(50,cents))}%`;
      centsBar.style.transform = 'translateX(-50%)';
      centsLabel.textContent = Math.abs(cents) <= 5 ? 'in tune' : `${Math.abs(cents)}¢ ${cents > 0 ? 'sharp' : 'flat'}`;
      centsLabel.classList.toggle('is-good', Math.abs(cents) <= 5);
    } else { noteReadout.textContent = '—'; centsLabel.textContent = ''; centsLabel.classList.remove('is-good'); }
    levelFill.style.width = `${Math.min(100, frame.rms*320)}%`;
  }

  function onChord(chord: ChordDetection): void {
    chordReadout.textContent = chord.label;
    chordConfidence.textContent = `${Math.round(chord.confidence*100)}% · likely chord`;
    const previous = chordHistory.at(-1);
    if (previous?.label === chord.label) return;
    const heard: HeardChord = { ...chord, heardAt: Date.now() };
    chordHistory.push(heard); while (chordHistory.length > 8) chordHistory.shift();
    refreshHarmony();
    if (!previous) addCoach(`That sounds like ${chord.label}.`, 'chord');
    else if (Date.now() - previous.heardAt > 450) addCoach(`${previous.label} → ${chord.label}.`, 'chord');
  }

  const timer = window.setInterval(async () => {
    if (checking) return; checking = true;
    try { renderTimeline(); await coachLatestPhrase(); const echoes = await context.session.newEchoes(); if (!disposed) echoes.forEach(showEcho); }
    catch (error) { if (!disposed) context.say((error as Error).message, 'error'); }
    finally { checking = false; }
  }, 650);

  update(); refreshHarmony();
  return { element, update, onNotes:update, onFrame, onChord, dispose(){ disposed=true; window.clearInterval(timer); if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } };
}
