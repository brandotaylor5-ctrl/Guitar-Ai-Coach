/**
 * Today's session, with a clock running.
 *
 * A list of things you could do is not practice. What moves somebody along is
 * a short ordered session with an end to it, done today and again tomorrow —
 * and the clock matters as much as the content, because "practise this for a
 * while" is how five minutes of chord changes turns into twenty minutes of
 * playing the one riff you already know.
 *
 * So each item is timed, the timer runs itself, and the session finishes. A
 * finished session is the thing you can do again tomorrow; an open-ended one
 * is a chore with no edge.
 */

import { buildSession } from '../../src/curriculum/session.ts';
import type { ItemKind, SessionItem } from '../../src/curriculum/session.ts';
import { loadProgress } from '../../src/curriculum/path.ts';
import { masteryMap } from '../../src/curriculum/mastery.ts';
import { CurriculumStore } from '../../src/curriculum/watch.ts';
import {
  PlayerModelStore, buildPlayerProfile, recommendAdaptiveTask,
} from '../../src/coach/playerModel.ts';
import { h, clear, replace } from '../ui/dom.ts';
import { button } from '../ui/render.ts';
import type { AppContext, View } from './context.ts';

function storage() {
  try {
    window.localStorage.setItem('__probe__', '1');
    window.localStorage.removeItem('__probe__');
    return window.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); } };
  }
}

const KIND_LABEL: Record<ItemKind, string> = {
  'warm-up': 'Warm up',
  new: 'The new thing',
  review: 'Keep what you have',
  song: 'Play something whole',
  play: 'Mess about',
};

const LENGTH_KEY = 'guitar-session-minutes';

export function practiceTodayView(context: AppContext): View {
  const store = storage();
  const modelStore = new PlayerModelStore(store);
  const element = h('div', { class: 'view view-practice' });

  let minutes = Number(store.getItem(LENGTH_KEY) ?? 15) || 15;
  let running: { index: number; endsAt: number; timer: number } | null = null;
  let done = new Set<number>();

  function stopTimer(): void {
    if (running) window.clearInterval(running.timer);
    running = null;
  }

  function itemCard(item: SessionItem, index: number): HTMLElement {
    const isRunning = running?.index === index;
    const left = h('span', { class: 'item-time', text: `${item.minutes} min` });

    if (isRunning && running) {
      const active = running;
      const tick = () => {
        const remaining = Math.max(0, active.endsAt - Date.now());
        const secs = Math.ceil(remaining / 1000);
        left.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
        if (remaining <= 0) {
          stopTimer();
          done.add(index);
          context.say(`${item.title} — done. Next.`);
          render();
        }
      };
      tick();
      active.timer = window.setInterval(tick, 500);
    }

    return h('article', {
      class: `practice-item is-${item.kind}${isRunning ? ' is-running' : ''}${done.has(index) ? ' is-done' : ''}`,
    },
      h('header', { class: 'item-head' },
        h('span', { class: 'item-kind', text: item.label ?? KIND_LABEL[item.kind] }),
        left,
      ),
      h('h3', { text: item.title }),
      h('p', { class: 'item-what', text: item.what }),
      // The instructions live here, not behind a button. A session you have to
      // navigate away from to actually do is a table of contents.
      item.do?.length
        ? h('ol', { class: 'step-steps' }, ...item.do.map((line) => h('li', { text: line })))
        : h('span'),
      h('details', { class: 'theory' },
        h('summary', { text: 'Why this is in today' }),
        h('p', { text: item.because }),
      ),
      h('div', { class: 'practice-actions' },
        isRunning
          ? button('Stop', () => { stopTimer(); render(); }, 'btn-quiet')
          : button(done.has(index) ? 'Do it again' : 'Start this', () => {
              stopTimer();
              done.delete(index);
              running = { index, endsAt: Date.now() + item.minutes * 60_000, timer: 0 };
              render();
            }, 'btn-primary'),
        item.goTo
          ? button('Open it', () => context.navigate(item.goTo!.view, item.goTo!.params ?? {}), 'btn-quiet')
          : h('span'),
        button('Skip', () => { done.add(index); stopTimer(); render(); }, 'btn-quiet'),
      ),
    );
  }

  function render(): void {
    const progress = loadProgress(store);
    const mastery = masteryMap(new CurriculumStore(store).load());
    const session = buildSession(progress.current, mastery, minutes);
    const profile = buildPlayerProfile(modelStore.load());
    const adaptive = recommendAdaptiveTask(profile);

    clear(element);
    element.append(
      h('header', { class: 'view-head' },
        h('h2', { text: 'Today' }),
        // Describe the session that was actually built. Promising "then play
        // something whole" to somebody who cannot play anything yet is how a
        // front page starts feeling like it was written for somebody else.
        h('p', { text: `${session.minutes} minutes, in the order a teacher would put them: ${
          session.items.map((item) => (item.label ?? KIND_LABEL[item.kind]).toLowerCase()).join(', ')
        }.` }),
      ),
      h('div', { class: 'length-switch' },
        h('span', { class: 'doctor-label', text: 'How long have you got?' }),
        h('div', { class: 'check-picker' }, ...[5, 10, 15, 25].map((option) =>
          button(`${option} min`, () => {
            minutes = option;
            try { store.setItem(LENGTH_KEY, String(option)); } catch { /* fine */ }
            done = new Set();
            stopTimer();
            render();
          }, `level-chip${option === minutes ? ' is-on' : ''}`))),
      ),
    );

    const adaptiveParams: Record<string, string> = {
      lesson: adaptive.lessonId,
      adaptive: adaptive.kind,
    };
    if (adaptive.zoneIndex !== undefined) adaptiveParams.zone = String(adaptive.zoneIndex);
    if (adaptive.bpm !== undefined) adaptiveParams.bpm = String(adaptive.bpm);

    element.appendChild(h('section', { class: 'panel today-adaptive-card' },
      h('p', { class: 'eyebrow', text: 'COACH NOTICED' }),
      h('h3', { text: adaptive.title }),
      h('p', { text: adaptive.reason }),
      h('p', { class: 'muted', text: adaptive.instruction }),
      h('div', { class: 'practice-actions' },
        button('Give this 3 focused minutes', () => context.navigate('lab', adaptiveParams), 'btn-primary'),
        button('Why are you recommending this?', () => context.navigate('fingerprint'), 'btn-quiet'),
      ),
    ));

    for (const [index, item] of session.items.entries()) {
      element.appendChild(itemCard(item, index));
    }

    if (done.size >= session.items.length) {
      element.appendChild(h('section', { class: 'panel unlock-card' },
        h('h4', { text: 'That is today done' }),
        h('p', { text: 'Come back tomorrow. Ten honest minutes a day beats an hour on Sunday, and this is the part almost nobody gets right.' }),
        button('Go again', () => { done = new Set(); render(); }, 'btn-quiet'),
      ));
    }
  }

  render();
  return { element, update: render, dispose: stopTimer };
}
