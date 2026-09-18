/**
 * The course, on screen.
 *
 * The rule this screen exists to enforce: never ask the player a question
 * before you have taught them something. Every other screen in this app used
 * to open by asking what they already knew, which is a reasonable question to
 * ask a guitarist and a useless one to ask a beginner — and a beginner is who
 * opens a learn-the-guitar app.
 *
 * So the whole course is here from the first second, numbered, including the
 * parts that are months away. Seeing that minor pentatonic is step fourteen is
 * what makes step one worth doing.
 */

import { PATH, loadProgress, saveDone } from '../../src/curriculum/path.ts';
import type { PathStep } from '../../src/curriculum/path.ts';
import { h, clear } from '../ui/dom.ts';
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

const KIND_LABEL: Record<PathStep['kind'], string> = {
  know: 'Know this',
  chord: 'Chord',
  technique: 'Technique',
  scale: 'Scale',
  song: 'Song',
  create: 'Make something',
};

export function pathView(context: AppContext): View {
  const store = storage();
  const element = h('div', { class: 'view view-path' });

  function stepCard(step: PathStep, index: number, state: 'done' | 'current' | 'ahead'): HTMLElement {
    const number = h('span', { class: 'step-number', text: String(index + 1) });
    const head = h('button', {
      class: 'step-head', type: 'button',
      onClick: () => {
        const card = head.closest('.step-card');
        card?.classList.toggle('is-open');
      },
    },
      number,
      h('span', { class: 'step-head-text' },
        h('span', { class: 'step-title', text: step.title }),
        h('span', { class: 'step-kind', text: KIND_LABEL[step.kind] }),
      ),
    );

    const body = h('div', { class: 'step-body' },
      h('p', { class: 'step-outcome', text: step.outcome }),

      h('h4', { text: 'Do this' }),
      h('ol', { class: 'step-steps' }, ...step.steps.map((line) => h('li', { text: line }))),

      h('div', { class: 'step-check' },
        h('strong', { text: 'You have got it when: ' }),
        h('span', { text: step.check }),
      ),

      step.watchFor
        ? h('div', { class: 'step-watch' },
            h('strong', { text: 'Most common mistake: ' }),
            h('span', { text: step.watchFor }),
          )
        : h('span'),

      h('p', { class: 'muted step-expect' }, h('strong', { text: 'How long: ' }), h('span', { text: step.expect })),

      h('details', { class: 'theory' },
        h('summary', { text: 'Why this is worth your time' }),
        h('p', { text: step.why }),
      ),

      h('div', { class: 'practice-actions' },
        step.practice
          ? button(step.practice.label, () => {
              context.navigate(step.practice!.view, step.practice!.params ?? {});
            }, 'btn-primary')
          : h('span'),
        button(state === 'done' ? 'Not done after all' : 'I can do this', () => {
          const progress = loadProgress(store);
          if (progress.done.has(step.id)) progress.done.delete(step.id);
          else progress.done.add(step.id);
          saveDone(store, progress.done);
          render();
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 'btn-quiet'),
      ),
    );

    const card = h('article', { class: `step-card is-${state}${state === 'current' ? ' is-open' : ''}` }, head, body);
    return card;
  }

  function render(): void {
    clear(element);
    const progress = loadProgress(store);

    element.append(
      h('header', { class: 'view-head' },
        h('h2', { text: 'Learn the guitar' }),
        h('p', { text: progress.completed === 0
          ? 'Start at the top. Every step tells you exactly what to do, how to know you have got it, and roughly how long it takes. Nothing is hidden — scroll down and you can see where this goes.'
          : `${progress.completed} of ${PATH.length} done. Pick up at step ${PATH.indexOf(progress.current) + 1}.` }),
      ),
    );

    const list = h('div', { class: 'step-list' });
    PATH.forEach((step, index) => {
      const state = progress.done.has(step.id) ? 'done' : step.id === progress.current.id ? 'current' : 'ahead';
      list.appendChild(stepCard(step, index, state));
    });
    element.appendChild(list);

    element.appendChild(h('section', { class: 'panel' },
      h('p', { class: 'muted', text: 'This course is fixed and the same for everyone. The rest of the app is not — it listens to what you actually play and adapts. Both are useful; this is the one that works before it has heard you.' }),
    ));
  }

  render();
  return { element, update: render };
}
