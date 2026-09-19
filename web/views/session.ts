/**
 * Live Coach — the musician/teacher sitting across from you.
 *
 * The screen is deliberately organised around four musical questions:
 * Harmony: what chord is that and where do my fingers go?
 * Melody: what shape did my line make?
 * Time: where is the pulse and am I holding it?
 * Create: what can I turn this into?
 *
 * The detector never gets to masquerade as eyesight. Chord/string evidence is
 * scored where the microphone can honestly help; hand mechanics stay concrete
 * physical instructions rather than fake AI confidence.
 */

import type { Frame } from '../../src/audio/noteTracker.ts';
import type { Phrase, PhraseAnalysis, RecognitionMatch } from '../../src/types.ts';
import { frequencyToMidi, midiToName, pcToName } from '../../src/music/notes.ts';
import { suggestAnswer, suggestChords, suggestEndings } from '../../src/create/suggest.ts';
import { diffTakes } from '../../src/phrase/diff.ts';
import { motifContaining } from '../../src/phrase/motif.ts';
import type { ChordDetection, ChordExplanation } from '../audio/chordDetect.ts';
import { observeFreePlay, CurriculumStore } from '../../src/curriculum/watch.ts';
import { masteryMap, levelOf, WORKABLE } from '../../src/curriculum/mastery.ts';
import { SKILLS } from '../../src/curriculum/skills.ts';
import { checkChordShape } from '../../src/audio/chordCheck.ts';
import type { ChordCheck } from '../../src/audio/chordCheck.ts';
import { chordDoctor } from '../ui/chordDoctor.ts';
import { stringCheckPanel } from '../ui/stringCheck.ts';
import { beginnerChordShapes, chordShape, chordShapeMidis } from '../../src/music/chordShapes.ts';
import { inferFingering, renderTab } from '../../src/music/fretboard.ts';
import {
  compactChordLabel, inferHarmonyCenter, nextPlayableChord, normalizeChordLabel,
  qualityFamily, readMelody, readTime, readTouch,
} from '../../src/coach/liveTutor.ts';
import {
  PlayerModelStore, buildPlayerProfile, phraseObservation, recommendAdaptiveTask,
} from '../../src/coach/playerModel.ts';
import { chordDiagram, chordTeachingCard } from '../ui/chordCard.ts';
import { audioContext, audioOutput, unlockAudio } from '../audio/context.ts';
import { h, clear, relativeTime, replace } from '../ui/dom.ts';
import {
  button, empty, fretboardDiagram, noteRow, highlightNote, tabBlock,
} from '../ui/render.ts';
import { recallPanel } from './recall.ts';
import type { AppContext, View } from './context.ts';

const MOTIF_HUES = [168, 38, 280, 200, 12, 320, 90];
interface HeardChord extends ChordDetection { heardAt: number; }

function lowerFirst(sentence: string): string {
  if (!sentence) return sentence;
  return sentence.charAt(0).toLowerCase() + sentence.slice(1);
}

export function sessionView(context: AppContext): View {
  let recallHost = h('div', { class: 'recall-host' });
  let lastPhraseSignature = '';
  let lastCoachedPhraseId = '';
  let lastNoteAt = 0;
  let freeplay: Array<{ label: string; confidence: number; at: number }> = [];
  let voiceEnabled = false;
  let lastSpokenAt = 0;
  let pendingVoice: { text: string; kind: string } | null = null;
  let disposed = false;
  let checking = false;
  let previousAnalysis: PhraseAnalysis | null = null;
  let targetChord: string | null = null;
  let targetBestScore = -1;
  let targetCleanAnnounced = false;
  let targetFeedbackHost: HTMLElement | null = null;
  let tempoClickTimer = 0;
  let currentTempoBpm = 0;
  const shownChordLessons = new Set<string>();
  const chordHistory: HeardChord[] = [];

  const curriculum = new CurriculumStore(
    (() => {
      try {
        window.localStorage.setItem('__probe__', '1');
        window.localStorage.removeItem('__probe__');
        return window.localStorage;
      } catch {
        const memory = new Map<string, string>();
        return {
          getItem: (k: string) => memory.get(k) ?? null,
          setItem: (k: string, v: string) => { memory.set(k, v); },
        };
      }
    })(),
  );

  const playerModel = new PlayerModelStore(
    (() => {
      try {
        window.localStorage.setItem('__player_model_probe__', '1');
        window.localStorage.removeItem('__player_model_probe__');
        return window.localStorage;
      } catch {
        const memory = new Map<string, string>();
        return {
          getItem: (k: string) => memory.get(k) ?? null,
          setItem: (k: string, v: string) => { memory.set(k, v); },
        };
      }
    })(),
  );
  let lastAdaptiveKind = '';

  // ---- the four things a musician actually wants to know -----------------

  const noteReadout = h('span', { class: 'live-now-note', text: '—' });
  const centsBar = h('div', { class: 'cents-fill' });
  const centsLabel = h('span', { class: 'cents-label', text: '' });
  const levelFill = h('div', { class: 'level-fill' });

  const chordReadout = h('div', { class: 'live-chord-value', text: '—' });
  const chordConfidence = h('span', { class: 'muted', text: 'waiting for a chord' });
  const chordShow = button('Show me the hand', () => {
    const chord = chordHistory.at(-1);
    if (!chord) return;
    openChordTutor(chord.label, `That chord was ${chord.label}. Here is the physical shape.`, false);
  }, 'btn-quiet');
  chordShow.disabled = true;

  const melodyValue = h('div', { class: 'live-musical-value', text: 'Play a short line' });
  const melodyDetail = h('p', { class: 'muted live-musical-detail', text: 'I will read the shape after you leave a small pause.' });
  const melodyNotes = h('div', { class: 'live-mini-notes' });

  const tempoValue = h('div', { class: 'live-musical-value', text: '—' });
  const tempoDetail = h('p', { class: 'muted live-musical-detail', text: 'Repeat a figure and I can estimate your pulse.' });
  const tempoPracticeButton = button('Practice this pulse', () => { void toggleTempoPractice(); }, 'btn-quiet');
  tempoPracticeButton.disabled = true;

  const centerReadout = h('div', { class: 'live-center-value', text: '—' });
  const centerHint = h('span', { class: 'muted', text: 'I need a couple chord changes or a settled melody first.' });

  const progression = h('div', { class: 'live-progression live-progression-chips' });
  const harmonyNext = h('div', { class: 'live-harmony-next muted', text: 'Play two chord changes and I can suggest a teachable next move.' });

  const tryNext = h('div', { class: 'live-try-next muted', text: 'Play something. I will give you one musical thing to try, not ten.' });
  const adaptiveHost = h('div', { class: 'live-adaptive-host' });
  const chordTutorHost = h('div', { class: 'live-chord-tutor' });
  const createHost = h('div', { class: 'live-create-host' });
  const coachFeed = h('div', { class: 'live-coach-feed', 'aria-live': 'polite' });
  const echoHost = h('div', { class: 'echo-host' });
  const noteStream = h('div', { class: 'note-stream' });
  const timeline = h('div', { class: 'timeline' });
  const timelineNote = h('p', { class: 'timeline-note muted' });

  const listenButton = button(context.listening ? 'Stop listening' : 'Start Live Coach', async () => {
    if (context.listening) await context.stopListening();
    else await context.startListening();
  }, 'btn-primary btn-listen');

  const voiceButton = button('Voice coach: off', () => {
    voiceEnabled = !voiceEnabled;
    voiceButton.textContent = `Voice coach: ${voiceEnabled ? 'on' : 'off'}`;
    voiceButton.classList.toggle('is-live', voiceEnabled);

    if (voiceEnabled && 'speechSynthesis' in window) {
      lastSpokenAt = Date.now();
      pendingVoice = null;
      const utterance = new SpeechSynthesisUtterance(
        'Voice coach on. Keep playing. I will wait for a pause before I talk.',
      );
      utterance.rate = 1.02;
      utterance.pitch = 0.96;
      window.speechSynthesis.speak(utterance);
    } else if ('speechSynthesis' in window) {
      pendingVoice = null;
      window.speechSynthesis.cancel();
    }
  }, 'btn-quiet');

  const askButton = button('Break down the last idea', async () => {
    const recall = await context.session.whatDidIJustPlay();
    if (!recall) {
      context.say('Nothing to go on yet — play a few notes first.');
      return;
    }
    replace(recallHost, recallPanel(context, recall));
    recallHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 'btn-primary btn-ask');

  // The manual checker and detector diagnostics are useful tools, not the
  // front door. Keep them available without making the whole interface a lab.
  const checker = stringCheckPanel({
    chords: beginnerChordShapes().map((shape) => shape.chord),
    tuning: context.session.tuning,
    listening: () => context.listening,
    onNeedMic: () => { void context.startListening(); },
  });
  context.setChordDiagnostics?.(true);

  const doctor = chordDoctor();
  doctor.element.addEventListener('toggle', () => {
    context.setChordDiagnostics?.((doctor.element as HTMLDetailsElement).open || Boolean(targetChord));
  });

  const deepTools = h('details', { class: 'panel live-tools' },
    h('summary', { text: 'Chord cleanup + detector tools' }),
    h('p', { class: 'muted', text: 'Use these when you want to inspect one chord string-by-string or see why the detector made a decision.' }),
    checker.element,
    doctor.element,
  );

  const element = h('div', { class: 'view view-session live-coach-view' },
    h('section', { class: 'panel live-coach-hero' },
      h('div', { class: 'live-coach-copy' },
        h('p', { class: 'lab-kicker', text: 'LIVE COACH' }),
        h('h2', { text: 'Play. I’ll teach from what you actually do.' }),
        h('p', { class: 'muted', text: 'Chords become hand shapes. Melodies become phrases. Rhythm becomes a pulse. Good accidents can become riffs and songs.' }),
      ),
      h('div', { class: 'live-coach-actions' },
        listenButton,
        voiceButton,
        button('Open the course', () => context.navigate('path'), 'btn-quiet'),
      ),
    ),

    h('section', { class: 'live-hearing-grid live-hearing-grid-tutor' },
      h('article', { class: 'panel live-hearing-card chord-card' },
        h('span', { class: 'live-hearing-label', text: 'HARMONY · CHORD' }),
        chordReadout,
        chordConfidence,
        h('div', { class: 'live-card-action' }, chordShow),
      ),
      h('article', { class: 'panel live-hearing-card melody-card' },
        h('span', { class: 'live-hearing-label', text: 'MELODY' }),
        melodyValue,
        melodyDetail,
        melodyNotes,
        h('div', { class: 'live-now-line' },
          h('span', { class: 'muted', text: 'right now' }),
          noteReadout,
          h('div', { class: 'cents live-mini-cents' }, h('div', { class: 'cents-track' }, centsBar)),
          centsLabel,
        ),
        h('div', { class: 'level live-mini-level' }, levelFill),
      ),
      h('article', { class: 'panel live-hearing-card time-card' },
        h('span', { class: 'live-hearing-label', text: 'TIME · TEMPO' }),
        tempoValue,
        tempoDetail,
        h('div', { class: 'live-card-action' }, tempoPracticeButton),
      ),
      h('article', { class: 'panel live-hearing-card center-card' },
        h('span', { class: 'live-hearing-label', text: 'HOME / KEY CLUE' }),
        centerReadout,
        centerHint,
      ),
    ),

    h('section', { class: 'panel live-progression-panel' },
      h('div', { class: 'live-section-head' },
        h('div', {},
          h('span', { class: 'live-hearing-label', text: 'YOUR CHORD STORY' }),
          h('h3', { text: 'Tap any chord and I’ll show you the hand.' }),
        ),
        button('Build a riff over these', () => sendHarmonyToLab(), 'btn-quiet'),
      ),
      progression,
      harmonyNext,
    ),

    h('section', { class: 'panel live-next-panel' },
      h('span', { class: 'live-hearing-label', text: 'COACH MOVE' }),
      tryNext,
    ),

    adaptiveHost,

    chordTutorHost,
    createHost,

    h('section', { class: 'panel live-coach-panel' },
      h('div', { class: 'live-coach-panel-head' },
        h('div', {},
          h('h2', { text: 'Coach' }),
          h('p', { class: 'muted', text: 'I notice while you play, then talk when you leave me room — like a tutor should.' }),
        ),
        askButton,
      ),
      coachFeed,
      echoHost,
    ),

    deepTools,

    h('details', { class: 'panel live-session-memory' },
      h('summary', { text: 'Session memory · last minute' }),
      h('p', { class: 'muted', text: 'Each block is a phrase. Repeated colors mean you came back to a similar idea. Tap one for the full breakdown.' }),
      timeline,
      h('div', { class: 'timeline-scale' }, h('span', { text: 'a minute ago' }), h('span', { text: 'now' })),
      timelineNote,
      h('details', { class: 'section live-details' },
        h('summary', { text: 'Raw notes I am hearing' }),
        noteStream,
      ),
    ),
    recallHost,
  );

  // ---- voice that waits for the musical gap ------------------------------

  const COOLDOWN_MS: Record<string, number> = {
    memory: 25_000,
    variation: 25_000,
    phrase: 18_000,
    teaching: 14_000,
    success: 8_000,
  };
  const SILENT_KINDS = new Set(['chord', 'hello', 'observation']);
  const PAUSE_BEFORE_SPEAKING_MS = 1_550;

  function trySpeak(text: string, kind: string, force = false): boolean {
    if (!voiceEnabled || !('speechSynthesis' in window) || SILENT_KINDS.has(kind)) return false;
    const now = Date.now();
    if (!force && now - lastNoteAt < PAUSE_BEFORE_SPEAKING_MS) return false;
    if (!force && now - lastSpokenAt < (COOLDOWN_MS[kind] ?? 18_000)) return false;
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) return false;

    lastSpokenAt = now;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.pitch = 0.96;
    utterance.volume = 0.9;
    window.speechSynthesis.speak(utterance);
    return true;
  }

  function speakOrQueue(text: string, kind: string): void {
    if (!voiceEnabled || SILENT_KINDS.has(kind)) return;
    if (!trySpeak(text, kind)) pendingVoice = { text, kind };
  }

  function flushPendingVoice(): void {
    if (!pendingVoice) return;
    if (trySpeak(pendingVoice.text, pendingVoice.kind)) pendingVoice = null;
  }

  function addCoach(text: string, kind = 'observation', action?: HTMLElement): void {
    const turn = h('article', { class: `live-coach-turn is-${kind}` },
      h('span', { class: 'live-coach-avatar', text: '✦' }),
      h('div', { class: 'live-coach-turn-body' }, h('p', { text }), action ?? null),
    );
    coachFeed.appendChild(turn);
    while (coachFeed.children.length > 7) coachFeed.firstElementChild?.remove();
    coachFeed.scrollTop = coachFeed.scrollHeight;
    speakOrQueue(text, kind);
  }

  addCoach('I’m ready. Start Live Coach and play naturally. I will teach from whatever shows up.', 'hello');

  function renderAdaptiveCoach(announce = false): void {
    clear(adaptiveHost);
    const profile = buildPlayerProfile(playerModel.load());
    const task = recommendAdaptiveTask(profile);

    const stats = h('div', { class: 'live-adaptive-stats' },
      h('span', { class: 'badge', text: `${profile.phraseCount} phrases remembered` }),
      h('span', { class: 'badge', text: `${profile.practiceCount} measured attempts` }),
      profile.tempo.median
        ? h('span', { class: 'badge', text: `usual pulse ~${Math.round(profile.tempo.median)} BPM` })
        : null,
      profile.timing.tendency !== 'unknown'
        ? h('span', { class: 'badge', text: `timing: ${profile.timing.tendency}` })
        : null,
    );

    const params: Record<string, string> = {
      lesson: task.lessonId,
      adaptive: task.kind,
    };
    if (task.zoneIndex !== undefined) params.zone = String(task.zoneIndex);
    if (task.bpm !== undefined) params.bpm = String(task.bpm);

    adaptiveHost.appendChild(h('section', { class: 'panel live-adaptive-panel' },
      h('div', { class: 'live-section-head' },
        h('div', {},
          h('p', { class: 'eyebrow', text: 'BASED ON YOUR PLAYING' }),
          h('h3', { text: task.title }),
          h('p', { text: task.reason }),
        ),
        h('span', { class: 'badge', text: `${Math.round(task.confidence * 100)}% confidence` }),
      ),
      h('p', { class: 'live-adaptive-instruction', text: task.instruction }),
      stats,
      h('div', { class: 'practice-actions' },
        button('Train this now', () => context.navigate('lab', params), 'btn-primary'),
        button('See what Coach has learned', () => context.navigate('fingerprint'), 'btn-quiet'),
      ),
    ));

    if (
      announce &&
      task.kind !== 'collect' &&
      task.confidence >= .65 &&
      task.kind !== lastAdaptiveKind
    ) {
      lastAdaptiveKind = task.kind;
      addCoach(
        `I’m starting to see something across sessions: ${task.reason} ${task.instruction}`,
        'teaching',
        button('Train that', () => context.navigate('lab', params), 'btn-quiet'),
      );
    }
  }

  function stopTempoPractice(): void {
    if (tempoClickTimer) window.clearInterval(tempoClickTimer);
    tempoClickTimer = 0;
    tempoPracticeButton.textContent = 'Practice this pulse';
    tempoPracticeButton.classList.remove('is-live');
  }

  async function toggleTempoPractice(): Promise<void> {
    if (tempoClickTimer) {
      stopTempoPractice();
      return;
    }
    if (!currentTempoBpm) return;
    await unlockAudio();

    const click = (strong: boolean) => {
      const ctx = audioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = strong ? 1450 : 980;
      gain.gain.setValueAtTime(strong ? 0.18 : 0.11, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.045);
      osc.connect(gain);
      gain.connect(audioOutput());
      osc.start();
      osc.stop(ctx.currentTime + 0.055);
    };

    let beat = 0;
    click(true);
    tempoPracticeButton.textContent = `Stop ${currentTempoBpm} BPM pulse`;
    tempoPracticeButton.classList.add('is-live');
    const beatMs = 60_000 / currentTempoBpm;
    tempoClickTimer = window.setInterval(() => {
      beat += 1;
      click(beat % 4 === 0);
    }, beatMs);
    addCoach(
      `I’m giving you ${currentTempoBpm} BPM. Play the same idea against this pulse and try to make the notes sit inside it instead of chasing it.`,
      'teaching',
    );
  }

  // ---- exact chord teaching + live string feedback -----------------------

  function chordSkillId(label: string): string | null {
    const clean = normalizeChordLabel(label);
    return SKILLS.find((skill) => skill.kind === 'chord' && skill.chord === clean)?.id ?? null;
  }

  function knowsChord(label: string): boolean {
    const id = chordSkillId(label);
    if (!id) return false;
    return levelOf(masteryMap(curriculum.load()), id) >= WORKABLE;
  }

  function playChord(label: string): void {
    const shape = chordShape(normalizeChordLabel(label));
    if (!shape) return;
    const notes = chordShapeMidis(shape).map((midi, index) => ({
      midi,
      startMs: index * 45,
      durationMs: 1200,
      confidence: 1,
      velocity: 0.58,
    }));
    void context.player.play(notes);
  }

  function targetCheckView(check: ChordCheck): HTMLElement {
    const rows = h('div', { class: 'live-target-strings' });
    for (const string of [...check.strings].reverse()) {
      const mark = string.verdict === 'ringing' ? '●'
        : string.verdict === 'missing' ? '✕'
          : string.verdict === 'unclear' ? '?'
            : '×';
      rows.appendChild(h('span', {
        class: `live-target-string is-${string.verdict}`,
        text: `${mark} ${string.stringNumber}`,
        title: string.fret === 'x'
          ? `String ${string.stringNumber}: do not play`
          : `String ${string.stringNumber}: ${string.fret === 0 ? 'open' : `fret ${string.fret}`}`,
      }));
    }
    return h('div', { class: `live-target-check${check.clean ? ' is-clean' : ''}` },
      h('strong', { text: check.advice[0] ?? (check.clean ? 'That chord is ringing.' : 'Try it again.') }),
      rows,
      ...check.advice.slice(1, 3).map((line) => h('p', { class: 'muted', text: line })),
    );
  }

  function armChordTarget(label: string): void {
    const clean = normalizeChordLabel(label);
    if (!chordShape(clean)) return;
    targetChord = clean;
    targetBestScore = -1;
    targetCleanAnnounced = false;
    context.setChordDiagnostics?.(true);
    if (targetFeedbackHost) {
      replace(targetFeedbackHost,
        h('p', { class: 'muted', text: `I’m listening specifically for ${clean}. Put the hand down, strum it slowly two or three times, and I’ll tell you which string is fighting you.` }),
      );
    }
    if (!context.listening) void context.startListening();
  }

  function openChordTutor(label: string, intro: string, arm: boolean, scroll = true): void {
    const clean = normalizeChordLabel(label);
    clear(chordTutorHost);
    targetFeedbackHost = null;

    const shape = chordShape(clean);
    if (!shape) {
      targetChord = null;
      chordTutorHost.appendChild(h('section', { class: 'panel live-chord-teacher' },
        h('p', { class: 'eyebrow', text: 'CHORD TUTOR' }),
        h('h3', { text: clean }),
        h('p', { text: intro }),
        h('p', { class: 'muted', text: 'I can hear that chord name, but I do not have a safe beginner hand map stored for it yet. I am not going to invent a fingering.' }),
      ));
      return;
    }

    const feedback = h('div', { class: 'live-target-feedback' });
    targetFeedbackHost = feedback;

    const teach = chordTeachingCard(clean, context.player, { compact: true });
    const top = h('section', { class: 'panel live-chord-teacher' },
      h('div', { class: 'live-section-head' },
        h('div', {},
          h('p', { class: 'eyebrow', text: 'CHORD TUTOR' }),
          h('h3', { text: `${shape.name} · ${clean}` }),
          h('p', { text: intro }),
        ),
        h('span', { class: `badge${knowsChord(clean) ? '' : ' is-new'}`, text: knowsChord(clean) ? 'in your vocabulary' : 'new shape' }),
      ),
      h('div', { class: 'practice-actions' },
        button('Hear it', () => playChord(clean), 'btn-quiet'),
        button(`Try ${clean} now`, () => armChordTarget(clean), 'btn-primary'),
      ),
      feedback,
    );

    chordTutorHost.append(top, teach);
    if (scroll) chordTutorHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (arm) armChordTarget(clean);
  }

  function updateTargetFromEvidence(explanation: ChordExplanation): void {
    if (!targetChord || !targetFeedbackHost) return;
    const shape = chordShape(targetChord);
    if (!shape) return;

    const check = checkChordShape(explanation.perMidi, shape, context.session.tuning);
    const score = check.strings.filter((string) =>
      string.verdict === 'ringing' || string.verdict === 'unclear').length;
    if (score < targetBestScore) return;
    targetBestScore = score;
    replace(targetFeedbackHost, targetCheckView(check));

    if (check.clean && !targetCleanAnnounced) {
      targetCleanAnnounced = true;
      const completed = targetChord;
      const id = chordSkillId(completed);
      if (id) {
        curriculum.record([{ skillId: id, quality: 0.9, at: Date.now(), source: 'drill' }]);
      }
      addCoach(
        `Yes — that’s ${completed}. Every string I can judge is ringing. Keep that hand shape, relax the grip, and play it once more so your hand remembers the feeling.`,
        'success',
        button('Show me another chord that fits', () => refreshHarmony(true), 'btn-quiet'),
      );
    }
  }

  // ---- harmony ------------------------------------------------------------

  function harmonyParams(): Record<string, string> {
    const center = inferHarmonyCenter(chordHistory);
    const recent = chordHistory.slice(-4);
    const fallback = recent[0];
    const rootPc = center?.rootPc ?? fallback?.rootPc ?? 4;
    const minor = center?.minor ?? (fallback ? qualityFamily(fallback.quality) === 'minor' : true);
    return {
      root: String(rootPc),
      mode: minor ? 'minor' : 'major',
      progression: recent
        .map((chord) => `${chord.rootPc}:${qualityFamily(chord.quality) === 'minor' ? 1 : 0}`)
        .join(','),
    };
  }

  function sendHarmonyToLab(): void {
    if (chordHistory.length < 2) {
      context.say('Give me at least two chord changes first.');
      return;
    }
    context.navigate('lab', harmonyParams());
  }

  function renderProgression(): void {
    clear(progression);
    if (!chordHistory.length) {
      progression.classList.add('muted');
      progression.appendChild(h('span', { text: 'Your chord progression will build here.' }));
      return;
    }

    progression.classList.remove('muted');
    chordHistory.forEach((chord, index) => {
      if (index) progression.appendChild(h('span', { class: 'progression-arrow', text: '→' }));
      const clean = normalizeChordLabel(chord.label);
      progression.appendChild(button(chord.label, () => {
        openChordTutor(clean, `You played ${chord.label} here. Tap “Try it now” and I’ll listen string-by-string.`, false);
      }, `chord-chip${chordShape(clean) ? '' : ' is-unmapped'}`));
    });
  }

  function refreshHarmony(announce = false): void {
    renderProgression();
    const center = inferHarmonyCenter(chordHistory);

    if (center) {
      centerReadout.textContent = `${pcToName(center.rootPc)} ${center.minor ? 'minor' : 'major'}`;
      centerHint.textContent = `${Math.round(center.confidence * 100)}% fit from the recent harmony — a clue, not a rule.`;
    } else {
      centerReadout.textContent = '—';
      centerHint.textContent = chordHistory.length < 2
        ? 'I need a couple chord changes first.'
        : 'The harmony is still ambiguous. Keep the loop going.';
    }

    clear(harmonyNext);
    if (!chordHistory.length) {
      harmonyNext.classList.add('muted');
      harmonyNext.appendChild(h('span', { text: 'Play two chord changes and I can suggest a teachable next move.' }));
      return;
    }

    const move = nextPlayableChord(
      center,
      chordHistory.at(-1),
      beginnerChordShapes().map((shape) => shape.chord),
    );

    if (!move) {
      harmonyNext.classList.add('muted');
      harmonyNext.appendChild(h('span', { text: center
        ? 'I hear the key family, but the next diatonic options I would choose do not have safe beginner shapes stored yet.'
        : 'Keep the loop going once more so I can hear where it wants to settle.' }));
      return;
    }

    harmonyNext.classList.remove('muted');
    const last = chordHistory.at(-1)!;
    harmonyNext.append(
      h('div', { class: 'live-harmony-suggestion' },
        h('div', { class: 'live-harmony-suggestion-copy' },
          h('span', { class: 'eyebrow', text: 'A CHORD WORTH TRYING' }),
          h('strong', { text: `${last.label} → ${move.label}` }),
          h('p', { text: move.reason }),
        ),
        h('div', { class: 'live-harmony-mini-shape' }, chordDiagram(move.label)),
      ),
      h('div', { class: 'practice-actions' },
        button(`Show + try ${move.label}`, () => {
          openChordTutor(move.label, `Try ${move.label} after ${last.label}. ${move.reason}`, true);
        }, 'btn-primary'),
        button(`Hear ${move.label}`, () => playChord(move.label), 'btn-quiet'),
      ),
    );

    if (announce) {
      addCoach(
        `Try ${move.label} after ${last.label}. I put the exact hand shape underneath — play it and I’ll listen for the strings.`,
        'teaching',
      );
    }
  }

  // ---- melody / time / creative work -------------------------------------

  function renderMusicalRead(analysis: PhraseAnalysis): void {
    const melody = readMelody(analysis);
    const time = readTime(analysis, previousAnalysis);
    const touch = readTouch(analysis.phrase.notes);

    melodyValue.textContent = melody.headline;
    melodyDetail.textContent = melody.detail;
    clear(melodyNotes);
    analysis.phrase.notes.slice(-8).forEach((note) =>
      melodyNotes.appendChild(h('span', { class: 'chip', text: midiToName(note.midi) })));

    tempoValue.textContent = time.bpm === null ? '—' : `~${time.bpm} BPM`;
    tempoDetail.textContent = time.bpm === null
      ? time.detail
      : `${time.detail} ${touch.headline !== 'Touch still unclear' ? `Touch: ${touch.headline.toLowerCase()}.` : ''}`;
    if (time.bpm !== null) {
      currentTempoBpm = time.bpm;
      tempoPracticeButton.disabled = false;
      if (!tempoClickTimer) tempoPracticeButton.textContent = `Practice ${time.bpm} BPM`;
    } else {
      currentTempoBpm = 0;
      tempoPracticeButton.disabled = true;
      stopTempoPractice();
    }

    // A melodic read is another clue about home. Do not overwrite a stronger
    // multi-chord key inference, but do fill the blank when melody arrives first.
    if (!inferHarmonyCenter(chordHistory)) {
      centerReadout.textContent = pcToName(analysis.homePc);
      centerHint.textContent = analysis.scale.confidence >= 0.55
        ? `Your line fits ${analysis.scale.label} at ${Math.round(analysis.scale.confidence * 100)}% confidence.`
        : 'This is the note your melody keeps treating like home. The scale is still ambiguous.';
    }
  }

  function suggestionFingering(notes: PhraseAnalysis['phrase']['notes']): HTMLElement {
    const positions = inferFingering(notes.map((note) => note.midi), {
      tuning: context.session.tuning,
      maxFret: 12,
    });
    return h('details', { class: 'live-fingering-details' },
      h('summary', { text: 'Show me one playable fingering' }),
      h('p', { class: 'muted', text: 'A pitch can live in several places on guitar. This is one low-travel fingering, not a claim about where your hand already was.' }),
      fretboardDiagram(positions, context.session.tuning),
      tabBlock(renderTab(positions, context.session.tuning)),
    );
  }

  async function savePhrase(phrase: Phrase, comment: string): Promise<void> {
    const riff = await context.session.saveRiff(phrase, { comment });
    await context.keepClipFor(riff.versions[0]?.audioRef);
    context.say('Saved. That one is yours now.');
  }

  function renderCreateFromRecall(recall: Awaited<ReturnType<AppContext['session']['recallPhrase']>>): void {
    clear(createHost);
    if (!recall) return;

    const analysis = recall.analysis;
    const phrase = recall.phrase;
    const answer = suggestAnswer(analysis, { tuning: context.session.tuning });
    const endings = suggestEndings(analysis, { tuning: context.session.tuning });
    const chords = suggestChords(analysis, 4)
      .map((chord) => ({ ...chord, symbol: compactChordLabel(chord.label) }))
      .filter((chord) => chordShape(chord.symbol));

    const ideaRow = noteRow(phrase.notes);
    const panel = h('section', { class: 'panel live-create-panel' },
      h('div', { class: 'live-section-head' },
        h('div', {},
          h('p', { class: 'eyebrow', text: 'CREATE FROM WHAT YOU JUST PLAYED' }),
          h('h3', { text: 'Don’t leave the good accident behind.' }),
          h('p', { class: 'muted', text: 'Keep it, harmonize it, answer it, or turn it into the beginning of a song.' }),
        ),
      ),
      h('div', { class: 'live-own-idea' },
        ideaRow,
        suggestionFingering(phrase.notes),
        h('div', { class: 'practice-actions' },
          button('Play it back', () => {
            void context.player.play(phrase.notes, {
              onNote: (index) => highlightNote(ideaRow, index),
              onEnd: () => highlightNote(ideaRow, null),
            });
          }, 'btn-quiet'),
          button('Save this riff', () => { void savePhrase(phrase, 'Caught by Live Coach'); }, 'btn-primary'),
          button('Practice this riff', async () => {
            const riff = await context.session.saveRiff(phrase, { comment: 'Live Coach → My Riff Trainer' });
            await context.keepClipFor(riff.versions[0]?.audioRef);
            const scaleIds: Record<string, string> = {
              'minor pentatonic': 'minor-pent',
              'major pentatonic': 'major-pent',
              'blues': 'blues',
              'minor': 'minor',
              'major': 'major',
              'dorian': 'dorian',
              'mixolydian': 'mixolydian',
            };
            context.navigate('lab', {
              riff: riff.id,
              root: String(analysis.scale.confidence >= .35 ? analysis.scale.tonicPc : analysis.homePc),
              scale: scaleIds[analysis.scale.scale] ?? 'minor-pent',
            });
          }, 'btn-quiet'),
          button('Full breakdown', () => { void showPhrase(phrase); }, 'btn-quiet'),
        ),
      ),
    );

    if (chords.length) {
      const harmony = h('div', { class: 'live-create-section' },
        h('h4', { text: 'Put a chord underneath it' }),
        h('p', { class: 'muted', text: 'These are scored by how much of your melody already lives inside the chord. Tap one and I’ll show you the hand.' }),
        h('div', { class: 'live-fit-chords' }),
      );
      const row = harmony.lastElementChild as HTMLElement;
      for (const chord of chords) {
        row.appendChild(button(
          `${chord.symbol} · ${Math.round(chord.fit * 100)}%`,
          () => openChordTutor(
            chord.symbol,
            `${Math.round(chord.fit * 100)}% of the notes in your melody already live inside ${chord.symbol}. Try holding it, then replay the melody.`,
            true,
          ),
          'chord-chip',
        ));
      }
      panel.appendChild(harmony);
    }

    if (answer) {
      const row = noteRow(answer.notes);
      panel.appendChild(h('div', { class: 'live-create-section' },
        h('h4', { text: 'Give your phrase an answer' }),
        h('p', { text: answer.description }),
        row,
        suggestionFingering(answer.notes),
        h('div', { class: 'practice-actions' },
          button('Hear your phrase → answer', () => { void context.player.play(answer.full); }, 'btn-primary'),
          button('Keep the two-part riff', async () => {
            await context.library.saveRiff(answer.full, { comment: 'Live Coach · call and response' });
            playerModel.recordCreative('answer', 'live-coach');
            renderAdaptiveCoach();
            context.say('Saved the call-and-response version as a new riff.');
          }, 'btn-quiet'),
        ),
      ));
    }

    if (endings.length) {
      const endingsHost = h('div', { class: 'live-ending-grid' });
      for (const ending of endings) {
        endingsHost.appendChild(h('article', { class: 'live-ending-card' },
          h('strong', { text: ending.label }),
          h('p', { class: 'muted', text: ending.description }),
          noteRow(ending.notes),
          h('div', { class: 'practice-actions' },
            button('Hear it', () => { void context.player.play(ending.full); }, 'btn-quiet'),
            button('Keep', async () => {
              await context.library.saveRiff(ending.full, {
                comment: `Live Coach · ${ending.label.toLowerCase()} ending`,
              });
              playerModel.recordCreative('ending', 'live-coach');
              renderAdaptiveCoach();
              context.say(`Saved the ${ending.label.toLowerCase()} version.`);
            }, 'btn-quiet'),
          ),
        ));
      }
      panel.appendChild(h('div', { class: 'live-create-section' },
        h('h4', { text: 'Change only the ending' }),
        h('p', { class: 'muted', text: 'Same identity, different emotional landing. This is songwriting without throwing away the thing you already liked.' }),
        endingsHost,
      ));
    }

    panel.appendChild(h('div', { class: 'live-create-section live-song-seed-action' },
      h('h4', { text: 'Make this the start of a song' }),
      button('Start a song from this idea', async () => {
        const name = window.prompt('Call this song idea what?', 'New song idea');
        if (name === null || !name.trim()) return;
        const riff = await context.session.saveRiff(phrase, { comment: 'Started in Live Coach' });
        await context.keepClipFor(riff.versions[0]?.audioRef);
        const song = await context.library.createSong(name.trim());
        await context.library.addToSong(song.id, 'verse', riff.id, riff.currentVersionId);
        playerModel.recordCreative('song-seed', 'live-coach');
        renderAdaptiveCoach();
        context.say('Song seed started from the exact phrase you played.');
        context.navigate('seeds');
      }, 'btn-primary'),
    ));

    createHost.appendChild(panel);
  }

  function renderPhraseCoachMove(analysis: PhraseAnalysis): void {
    const melody = readMelody(analysis);
    const time = readTime(analysis, previousAnalysis);
    const endings = suggestEndings(analysis, { tuning: context.session.tuning });
    const answer = suggestAnswer(analysis, { tuning: context.session.tuning });

    clear(tryNext);
    tryNext.classList.remove('muted');

    let headline = melody.next;
    if (time.bpm !== null && time.steadiness < 0.55) {
      headline = `Keep those exact notes, but slow the pulse down and make the spacing even. Your melody is fine; time is the thing worth training on this pass.`;
    }

    tryNext.appendChild(h('div', { class: 'live-coach-move-copy' },
      h('strong', { text: headline }),
      time.bpm !== null
        ? h('span', { class: 'muted', text: ` I’m hearing about ${time.bpm} BPM right now.` })
        : null,
    ));

    const suggestion = answer ?? endings[0];
    if (suggestion) {
      const row = noteRow(suggestion.notes);
      tryNext.append(
        row,
        suggestionFingering(suggestion.notes),
        h('div', { class: 'practice-actions' },
          button('Hear the idea', () => { void context.player.play(suggestion.notes); }, 'btn-quiet'),
          button('Hear it after mine', () => { void context.player.play(suggestion.full); }, 'btn-primary'),
        ),
      );
    }
  }

  // ---- timeline / memory --------------------------------------------------

  function renderNoteStream(): void {
    clear(noteStream);
    const notes = context.session.memory.all().slice(-30);
    if (!notes.length) {
      noteStream.appendChild(empty(context.listening ? 'Listening. Play something.' : 'Press Start Live Coach, then play.'));
      return;
    }
    for (const note of notes) noteStream.appendChild(h('span', { class: 'chip', text: midiToName(note.midi) }));
  }

  function renderTimeline(): void {
    const phrases = context.session.phrases();
    const motifs = context.session.motifs();
    const colourOf = new Map<string, number>();
    motifs.forEach((motif, index) =>
      motif.takes.forEach((take) =>
        colourOf.set(take.id, motif.takes.length > 1 ? MOTIF_HUES[index % MOTIF_HUES.length]! : -1)));

    clear(timeline);
    timelineNote.textContent = '';
    if (!phrases.length) {
      timeline.appendChild(empty('No settled phrase yet. Play an idea, then leave a short pause.'));
      return;
    }

    const repeated = motifs.filter((motif) => motif.takes.length > 1);
    if (repeated.length) {
      timelineNote.textContent = repeated.map((motif) =>
        `One idea came back ${motif.takes.length} times.`).join(' ');
    }

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
        title: phrase.notes.map((note) => midiToName(note.midi)).join(' → '),
        onClick: () => { void showPhrase(phrase); },
      }, h('span', { class: 'phrase-label', text: String(phrase.notes.length) })));
    }
  }

  function showEcho(match: RecognitionMatch): void {
    addCoach(
      `Hold on — that sounded a lot like ${match.riffName ?? 'a riff you saved'} from ${relativeTime(match.createdAt)}. You found the same shape again without asking for it.`,
      'memory',
      button('Open that riff', () => context.navigate('library', { riff: match.riffId }), 'btn-quiet'),
    );
  }

  async function showPhrase(phrase: Phrase): Promise<void> {
    const recall = await context.session.recallPhrase(phrase.id);
    if (!recall) {
      context.say('That idea has aged out of session memory.');
      return;
    }
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
    const tempoChanged = Math.abs(diff.tempoRatio - 1) >= 0.08;
    if (changedCount > 4 && !tempoChanged) return false;

    const text = diff.identical && !tempoChanged
      ? 'There — you came back to the same idea almost exactly. That repetition is starting to sound intentional.'
      : `There — same basic idea, different take: ${lowerFirst(diff.summary)}`;

    const actions = h('div', { class: 'live-coach-inline-action' },
      button('Earlier take', () => { void context.player.play(prior.notes); }, 'btn-quiet'),
      button('This take', () => { void context.player.play(latest.notes); }, 'btn-quiet'),
    );

    addCoach(text, 'variation', actions);
    return true;
  }

  async function coachLatestPhrase(): Promise<void> {
    const latest = context.session.phrases().at(-1);
    if (!latest || latest.id === lastCoachedPhraseId || latest.notes.length < 3) return;
    lastCoachedPhraseId = latest.id;

    const recall = await context.session.recallPhrase(latest.id);
    if (!recall || disposed) return;

    const analysis = recall.analysis;
    const melody = readMelody(analysis);
    const time = readTime(analysis, previousAnalysis);

    playerModel.recordPhrase(phraseObservation(latest.id, analysis));
    renderAdaptiveCoach(true);
    renderMusicalRead(analysis);
    renderPhraseCoachMove(analysis);
    renderCreateFromRecall(recall);

    if (!variationReaction(latest)) {
      let text = `I heard a ${melody.headline.toLowerCase()}.`;
      if (time.bpm !== null) text += ` You’re around ${time.bpm} BPM and the pulse is ${Math.round(time.steadiness * 100)}% consistent.`;
      if (analysis.scale.confidence >= 0.55) text += ` It sits comfortably in ${analysis.scale.label}.`;
      text += ` ${melody.next}`;
      addCoach(text, 'phrase');
    }

    previousAnalysis = analysis;
  }

  // ---- live input ---------------------------------------------------------

  function update(): void {
    listenButton.textContent = context.listening ? 'Stop listening' : 'Start Live Coach';
    listenButton.classList.toggle('is-live', context.listening);
    askButton.disabled = context.session.memory.size === 0;
    renderNoteStream();

    const signature = context.session.phrases().map((phrase) => phrase.id).join('|');
    if (signature !== lastPhraseSignature) {
      lastPhraseSignature = signature;
      renderTimeline();
      void coachLatestPhrase();
    }
  }

  function onFrame(frame: Frame): void {
    if (frame.rms > 0.02) lastNoteAt = Date.now();

    if (frame.hz > 0 && frame.clarity > 0.7) {
      const midi = frequencyToMidi(frame.hz);
      const cents = Math.round((midi - Math.round(midi)) * 100);
      noteReadout.textContent = midiToName(Math.round(midi));
      centsBar.style.left = `${50 + Math.max(-50, Math.min(50, cents))}%`;
      centsBar.style.transform = 'translateX(-50%)';
      centsLabel.textContent = Math.abs(cents) <= 5
        ? 'in tune'
        : `${Math.abs(cents)}¢ ${cents > 0 ? 'sharp' : 'flat'}`;
      centsLabel.classList.toggle('is-good', Math.abs(cents) <= 5);
    } else {
      noteReadout.textContent = '—';
      centsLabel.textContent = '';
      centsLabel.classList.remove('is-good');
    }

    levelFill.style.width = `${Math.min(100, frame.rms * 320)}%`;
  }

  function learnFromPlaying(): void {
    if (freeplay.length < 4) return;
    const observations = observeFreePlay(freeplay);
    freeplay = [];
    if (observations.length) curriculum.record(observations);
  }

  function onChord(chord: ChordDetection): void {
    chordReadout.textContent = chord.label;
    chordConfidence.textContent = `${Math.round(chord.confidence * 100)}% · likely chord · tap to learn it`;
    chordShow.disabled = !chordShape(normalizeChordLabel(chord.label));

    const previous = chordHistory.at(-1);
    if (previous?.label === chord.label) return;

    const heard: HeardChord = { ...chord, heardAt: Date.now() };
    chordHistory.push(heard);
    while (chordHistory.length > 8) chordHistory.shift();

    refreshHarmony();

    const clean = normalizeChordLabel(chord.label);
    freeplay.push({ label: clean, confidence: chord.confidence, at: heard.heardAt });
    if (freeplay.length >= 12) learnFromPlaying();

    if (targetChord && clean === targetChord && targetFeedbackHost && !targetCleanAnnounced) {
      replace(targetFeedbackHost,
        h('p', { class: 'muted', text: `Yes — I hear ${clean}. Hold the shape and give me another slow strum so I can check the individual strings.` }),
      );
    }

    if (!previous) addCoach(`That sounds like ${chord.label}.`, 'chord');
    else if (Date.now() - previous.heardAt > 450) addCoach(`${previous.label} → ${chord.label}.`, 'chord');

    if (chordShape(clean) && !knowsChord(clean) && !shownChordLessons.has(clean)) {
      shownChordLessons.add(clean);
      openChordTutor(
        clean,
        `You just found ${chord.label}. If that name means nothing to your hand yet, this is the shape.`,
        false,
        false,
      );
      addCoach(
        `That chord is ${chord.label}. I put the hand position on screen because naming a chord you do not know is not teaching it.`,
        'teaching',
      );
    }
  }

  function onChordExplain(explanation: ChordExplanation): void {
    checker.update(explanation);
    doctor.update(explanation);
    updateTargetFromEvidence(explanation);
  }

  const timer = window.setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      renderTimeline();
      await coachLatestPhrase();
      const echoes = await context.session.newEchoes();
      if (!disposed) echoes.forEach(showEcho);
      flushPendingVoice();
    } catch (error) {
      if (!disposed) context.say((error as Error).message, 'error');
    } finally {
      checking = false;
    }
  }, 650);

  update();
  refreshHarmony();
  renderAdaptiveCoach();

  return {
    element,
    update,
    onNotes: update,
    onFrame,
    onChord,
    onChordExplain,
    dispose() {
      context.setChordDiagnostics?.(false);
      stopTempoPractice();
      learnFromPlaying();
      disposed = true;
      window.clearInterval(timer);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    },
  };
}
