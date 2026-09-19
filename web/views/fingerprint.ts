/**
 * Your musical fingerprint.
 *
 * This screen has one rule: it never tells you a habit is a fault. It shows you
 * the shape of your own vocabulary, and then offers one door out of it — an
 * offer, not a correction.
 */

import { buildFingerprint, describeFingerprint, suggestDeparture, MIN_TAKES_FOR_FINGERPRINT } from '../../src/fingerprint/fingerprint.ts';
import {
  PlayerModelStore, buildPlayerProfile, recommendAdaptiveTask,
} from '../../src/coach/playerModel.ts';
import { pcToName } from '../../src/music/notes.ts';
import { h, clear } from '../ui/dom.ts';
import { button, empty } from '../ui/render.ts';
import type { AppContext, View } from './context.ts';

export function fingerprintView(context: AppContext): View {
  const element = h('div', { class: 'view view-fingerprint' });
  const modelStore = new PlayerModelStore(
    (() => {
      try {
        window.localStorage.setItem('__fingerprint_model_probe__', '1');
        window.localStorage.removeItem('__fingerprint_model_probe__');
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

  async function render(): Promise<void> {
    clear(element);
    const riffs = await context.library.listRiffs();
    // Every version counts: an idea you tried and abandoned is still yours.
    const takes = riffs.flatMap((riff) => riff.versions.map((version) => version.notes));
    const sessionTakes = context.session.phrases().map((phrase) => phrase.notes);
    const fingerprint = buildFingerprint([...takes, ...sessionTakes]);
    const playerProfile = buildPlayerProfile(modelStore.load());
    const adaptiveTask = recommendAdaptiveTask(playerProfile);

    const modelPanel = h('section', { class: 'panel player-model-panel' },
      h('p', { class: 'eyebrow', text: 'WHAT COACH ACTUALLY REMEMBERS' }),
      h('h2', { text: 'Your playing model' }),
      h('p', { class: 'muted', text: 'This uses heard musical evidence plus measured practice attempts. Fretboard-zone claims only come from exercises where the target hand position was known.' }),
      h('div', { class: 'player-model-stats' },
        h('article', {},
          h('span', { class: 'live-hearing-label', text: 'PHRASES' }),
          h('strong', { text: String(playerProfile.phraseCount) }),
          h('small', { text: 'remembered across sessions' }),
        ),
        h('article', {},
          h('span', { class: 'live-hearing-label', text: 'MEASURED ATTEMPTS' }),
          h('strong', { text: String(playerProfile.practiceCount) }),
          h('small', { text: 'where the target was known' }),
        ),
        h('article', {},
          h('span', { class: 'live-hearing-label', text: 'USUAL PULSE' }),
          h('strong', { text: playerProfile.tempo.median ? `~${Math.round(playerProfile.tempo.median)} BPM` : '—' }),
          h('small', { text: playerProfile.tempo.low && playerProfile.tempo.high
            ? `roughly ${Math.round(playerProfile.tempo.low)}–${Math.round(playerProfile.tempo.high)} BPM`
            : 'not enough tempo evidence yet' }),
        ),
        h('article', {},
          h('span', { class: 'live-hearing-label', text: 'TIMING' }),
          h('strong', { text: playerProfile.timing.tendency }),
          h('small', { text: playerProfile.timing.meanSteadiness !== null
            ? `${Math.round(playerProfile.timing.meanSteadiness * 100)}% average pulse consistency`
            : 'not enough evidence yet' }),
        ),
      ),
    );

    if (playerProfile.intervals.length) {
      modelPanel.append(
        h('h3', { text: 'Melodic moves you reach for' }),
        h('div', { class: 'known-skill-strip' },
          ...playerProfile.intervals.slice(0, 6).map((entry) =>
            h('span', { class: 'badge', text: `${entry.label} · ${Math.round(entry.share * 100)}%` })),
        ),
      );
    }

    if (playerProfile.zones.length) {
      modelPanel.append(
        h('h3', { text: 'Known physical neck evidence' }),
        h('div', { class: 'player-zone-grid' },
          ...playerProfile.zones.map((zone) =>
            h('article', { class: `player-zone-stat${zone === playerProfile.weakestZone ? ' is-weak' : zone === playerProfile.strongestZone ? ' is-strong' : ''}` },
              h('strong', { text: `Zone ${zone.zoneIndex + 1}` }),
              h('span', { text: `${Math.round(zone.meanAccuracy * 100)}% note accuracy` }),
              h('span', { class: 'muted', text: `${zone.attempts} attempt${zone.attempts === 1 ? '' : 's'}${zone.startFret !== null ? ` · around fret ${Math.round(zone.startFret)}` : ''}` }),
            )),
        ),
      );
    }

    modelPanel.appendChild(h('div', { class: 'departure adaptive-departure' },
      h('p', { class: 'eyebrow', text: 'CURRENT ADAPTIVE ASSIGNMENT' }),
      h('h3', { text: adaptiveTask.title }),
      h('p', { text: adaptiveTask.reason }),
      h('p', { class: 'muted', text: adaptiveTask.instruction }),
      button('Train this in Riff School', () => {
        const params: Record<string, string> = {
          lesson: adaptiveTask.lessonId,
          adaptive: adaptiveTask.kind,
        };
        if (adaptiveTask.zoneIndex !== undefined) params.zone = String(adaptiveTask.zoneIndex);
        if (adaptiveTask.bpm !== undefined) params.bpm = String(adaptiveTask.bpm);
        context.navigate('lab', params);
      }, 'btn-primary'),
    ));

    element.appendChild(modelPanel);

    const panel = h('section', { class: 'panel' },
      h('h2', { text: 'Your musical fingerprint' }),
      h('p', { class: 'muted', text: `Drawn from ${fingerprint.takeCount} of your own ideas — saved riffs, every version of them, and whatever is in this session.` }),
    );

    if (!fingerprint.hasEnoughMaterial) {
      // Refusing to guess is right. Leaving the screen with nothing on it and
      // nowhere to go is not — a page that only says "come back later" is a
      // dead end, and every dead end reads as the app being broken.
      panel.appendChild(empty(
        fingerprint.takeCount === 0
          ? `Nothing to draw from yet. This reads your own playing back to you — what you reach for, which notes you favour, how your ideas tend to move — and it needs about ${MIN_TAKES_FOR_FINGERPRINT} saved ideas before any of that is more than guesswork.`
          : `${fingerprint.takeCount} so far. Around ${MIN_TAKES_FOR_FINGERPRINT} and patterns start to show. Anything said before then would just be noise.`,
      ));
      panel.appendChild(h('div', { class: 'practice-actions' },
        button('Play something and let it listen', () => context.navigate('session'), 'btn-primary'),
        button('Keep a lick from a lesson', () => context.navigate('path'), 'btn-quiet'),
      ));
      element.appendChild(panel);
      return;
    }

    panel.appendChild(h('ul', { class: 'fingerprint-lines' },
      ...describeFingerprint(fingerprint).map((line) => h('li', { text: line })),
    ));

    const departure = suggestDeparture(fingerprint);
    if (departure) {
      panel.appendChild(h('div', { class: 'departure' },
        h('h3', { text: 'Want to try something else?' }),
        h('p', { text: departure }),
        h('p', { class: 'muted', text: 'Your habits are not a problem. This is only here if you feel like a change.' }),
      ));
    }
    element.appendChild(panel);

    const detail = h('section', { class: 'panel' }, h('h3', { text: 'The detail behind that' }));

    if (fingerprint.tonalCenters.length) {
      detail.appendChild(h('h4', { text: 'Home notes you return to' }));
      detail.appendChild(h('div', { class: 'bars' },
        ...fingerprint.tonalCenters.slice(0, 6).map((entry) => h('div', { class: 'bar-row' },
          h('span', { class: 'bar-label', text: pcToName(entry.value) }),
          h('span', { class: 'bar' }, h('span', { class: 'bar-fill', style: `width:${Math.round(entry.share * 100)}%` })),
          h('span', { class: 'bar-value', text: `${entry.count}` }),
        )),
      ));
    }

    if (fingerprint.melodicShapes.length) {
      detail.appendChild(h('h4', { text: 'Moves that keep coming back' }));
      detail.appendChild(h('ul', { class: 'shape-list' },
        ...fingerprint.melodicShapes.slice(0, 5).map((shape) => h('li', {},
          h('code', { text: shape.label }), ` — ${shape.count} times`,
        )),
      ));
    }

    const { resolution, register } = fingerprint;
    detail.appendChild(h('h4', { text: 'How your ideas end' }));
    detail.appendChild(h('p', { text:
      `${resolution.down} settle downward, ${resolution.up} reach upward, ${resolution.static} stay put.` }));
    detail.appendChild(h('p', { class: 'muted', text:
      `You play between ${pcToName(register.lowest % 12)} and ${pcToName(register.highest % 12)}, ` +
      `mostly around the ${register.mean < 52 ? 'lower' : register.mean < 64 ? 'middle' : 'upper'} strings.` }));

    element.appendChild(detail);
  }

  void render();
  return { element, update: () => { void render(); } };
}
