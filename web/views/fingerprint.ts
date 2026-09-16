/**
 * Your musical fingerprint.
 *
 * This screen has one rule: it never tells you a habit is a fault. It shows you
 * the shape of your own vocabulary, and then offers one door out of it — an
 * offer, not a correction.
 */

import { buildFingerprint, describeFingerprint, suggestDeparture, MIN_TAKES_FOR_FINGERPRINT } from '../../src/fingerprint/fingerprint.ts';
import { pcToName } from '../../src/music/notes.ts';
import { h, clear } from '../ui/dom.ts';
import { empty } from '../ui/render.ts';
import type { AppContext, View } from './context.ts';

export function fingerprintView(context: AppContext): View {
  const element = h('div', { class: 'view view-fingerprint' });

  async function render(): Promise<void> {
    clear(element);
    const riffs = await context.library.listRiffs();
    // Every version counts: an idea you tried and abandoned is still yours.
    const takes = riffs.flatMap((riff) => riff.versions.map((version) => version.notes));
    const sessionTakes = context.session.phrases().map((phrase) => phrase.notes);
    const fingerprint = buildFingerprint([...takes, ...sessionTakes]);

    const panel = h('section', { class: 'panel' },
      h('h2', { text: 'Your musical fingerprint' }),
      h('p', { class: 'muted', text: `Drawn from ${fingerprint.takeCount} of your own ideas — saved riffs, every version of them, and whatever is in this session.` }),
    );

    if (!fingerprint.hasEnoughMaterial) {
      panel.appendChild(empty(
        `There are only ${fingerprint.takeCount} ideas here so far. ` +
        `Once there are ${MIN_TAKES_FOR_FINGERPRINT} or so, patterns start to show up. ` +
        'Anything said before then would just be noise.',
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
