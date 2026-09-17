/**
 * Talking to one musical idea.
 *
 * Deliberately opt-in, and deliberately explicit about what leaves the machine:
 * everything else in this app stays on your computer, and this one panel does
 * not. It sends the notes of the phrase — never any audio — and only once you
 * have asked it to.
 *
 * The panel shows which tools ran on every turn. That is not debug output: the
 * player should be able to see that a change to their riff came from the app's
 * own musical operations rather than from a model's imagination.
 */

import type { NoteEvent, Phrase } from '../../src/types.ts';
import { Conversation } from '../../src/converse/conversation.ts';
import { ConversationWorkspace } from '../../src/converse/workspace.ts';
import { ProxyTransport, checkAvailability } from '../converse/transport.ts';
import { h, clear, replace } from '../ui/dom.ts';
import { button, empty, highlightNote, noteRow } from '../ui/render.ts';
import type { AppContext } from './context.ts';

/** Openers that suit whatever has just happened, so nobody faces a blank box. */
const SUGGESTIONS = [
  'Why does this sound the way it does?',
  'Give me three ways to finish this.',
  'What chord could sit underneath this?',
  'Make the ending darker.',
  'Keep everything except the last three notes.',
  'Give me another riff that answers this one.',
];

export interface ConversePanelOptions {
  /**
   * What to show when the model-backed conversation is unavailable. The local
   * keyword router fits here: it needs no key and works offline, so an
   * unavailable model should downgrade the conversation rather than remove it.
   */
  fallback?: () => HTMLElement;
}

export function conversationPanel(
  context: AppContext,
  phrase: Phrase,
  options: ConversePanelOptions = {},
): HTMLElement {
  const workspace = new ConversationWorkspace(context.session.tuning);
  workspace.openPhrase(phrase);

  const panel = h('section', { class: 'panel converse' });
  const transcript = h('div', { class: 'transcript' });
  const workingHost = h('div', { class: 'working' });
  const input = h('textarea', {
    class: 'ask-input', rows: 2,
    placeholder: 'Ask about this idea…',
    'aria-label': 'Ask about this musical idea',
  });

  let busy = false;
  let conversation: Conversation | null = null;

  function renderWorking(): void {
    clear(workingHost);
    const notes = workspace.notes;
    const row = noteRow(notes);
    workingHost.appendChild(h('div', { class: 'working-head' },
      h('span', { class: 'working-label', text: workspace.edited ? 'As it stands now' : 'What you played' }),
      workspace.edited ? h('span', { class: 'badge', text: 'changed' }) : null,
    ));
    workingHost.appendChild(h('div', { class: 'playable' },
      button('Play', async () => {
        await context.player.play(notes, {
          onNote: (index) => highlightNote(row, index),
          onEnd: () => highlightNote(row, null),
        });
      }, 'btn-play'),
      row,
    ));

    if (workspace.edited) {
      workingHost.appendChild(h('div', { class: 'working-actions' },
        button('Back to what I played', () => { workspace.revert(); renderWorking(); }, 'btn-quiet'),
        button('Keep this as a riff', async () => {
          const riff = await context.library.saveRiff(workspace.notes, {
            comment: workspace.history.map((step) => step.description).join('; ') || undefined,
          });
          context.say('Kept as a riff of your own. Your original phrase is untouched.');
          context.navigate('library', { riff: riff.id });
        }, 'btn-quiet'),
      ));
      workingHost.appendChild(h('ol', { class: 'working-steps' },
        ...workspace.history.map((step) => h('li', { text: step.description })),
      ));
    }
  }

  function bubble(role: 'you' | 'app', text: string, tools: string[] = []): HTMLElement {
    const node = h('div', { class: `bubble is-${role}` },
      h('span', { class: 'bubble-who', text: role === 'you' ? 'You' : 'Coach' }),
      ...text.split('\n').filter(Boolean).map((line) => h('p', { text: line })),
    );
    if (tools.length) {
      node.appendChild(h('p', { class: 'bubble-tools' },
        `Worked this out with: ${[...new Set(tools)].map(readable).join(', ')}.`));
    }
    return node;
  }

  async function send(question: string): Promise<void> {
    if (busy || !question.trim() || !conversation) return;
    busy = true;
    input.value = '';
    transcript.appendChild(bubble('you', question));

    const thinking = h('div', { class: 'bubble is-app is-thinking' }, h('p', { text: 'Listening back…' }));
    transcript.appendChild(thinking);
    transcript.scrollTop = transcript.scrollHeight;

    try {
      const turn = await conversation.ask(question);
      thinking.remove();
      transcript.appendChild(bubble('app', turn.text || 'I do not have anything useful to add there.', turn.toolsUsed));
      if (turn.stopReason === 'max_tokens') {
        transcript.appendChild(h('p', { class: 'muted', text: 'That answer got cut short — ask me to carry on.' }));
      }
    } catch (err) {
      thinking.remove();
      transcript.appendChild(h('div', { class: 'bubble is-error' }, h('p', { text: (err as Error).message })));
    } finally {
      busy = false;
      renderWorking();
      transcript.scrollTop = transcript.scrollHeight;
    }
  }

  function start(): void {
    conversation = new Conversation({
      transport: new ProxyTransport(),
      tools: {
        workspace,
        library: context.library,
        session: context.session,
        onPlay: (notes: NoteEvent[]) => { void context.player.play(notes); },
        onChange: () => renderWorking(),
      },
    });

    clear(panel);
    panel.appendChild(h('h3', { text: 'Talk about this idea' }));
    panel.appendChild(h('p', { class: 'muted privacy-note' },
      'This is the one part of the app that leaves your machine: the notes of this phrase go to ' +
      'Anthropic\'s API to be answered. No audio is ever sent, and nothing is sent until you ask something.'));
    panel.appendChild(workingHost);
    panel.appendChild(transcript);
    panel.appendChild(h('div', { class: 'suggestion-chips' },
      ...SUGGESTIONS.map((text) => h('button', {
        class: 'chip-btn', type: 'button', text,
        onClick: () => { void send(text); },
      })),
    ));
    panel.appendChild(h('div', { class: 'ask-row' },
      input,
      button('Ask', () => { void send(input.value); }, 'btn-primary'),
    ));

    input.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void send(input.value);
      }
    });

    renderWorking();
    input.focus();
  }

  // Until the server says the conversation is available, offer the honest
  // version of what is missing rather than a box that fails when used.
  replace(panel,
    h('h3', { text: 'Talk about this idea' }),
    h('p', { class: 'muted', text: 'Checking whether the conversation is switched on…' }),
  );

  void checkAvailability().then((status) => {
    if (status.available) {
      start();
      return;
    }
    if (options.fallback) {
      // Quietly the local one. Saying "no API key" to someone who never asked
      // for a model would be an apology for something they did not want.
      replace(panel, options.fallback());
      panel.appendChild(h('p', { class: 'muted converse-upgrade' },
        'This is answering on your device, so it understands common phrasings rather than ' +
        'anything you might say. Set an ANTHROPIC_API_KEY and restart to talk to it properly.'));
      return;
    }
    replace(panel,
      h('h3', { text: 'Talk about this idea' }),
      empty(status.reason ?? 'The conversation is not available.'),
      h('p', { class: 'muted' },
        'Everything else works without it. The conversation needs an Anthropic API key, because ' +
        'it is the only part of this app that calls out to a model.'),
    );
  });

  return panel;
}

/** Tool names are for the model; this is what the player should see. */
function readable(toolName: string): string {
  const names: Record<string, string> = {
    look_at_phrase: 'reading your phrase',
    explain_phrase: 'the plain-language explanation',
    suggest_endings: 'the ending generator',
    suggest_answer: 'the answering-phrase generator',
    suggest_chords: 'chord matching',
    change_note: 'changing a note',
    trim_phrase: 'trimming the phrase',
    extend_phrase: 'extending the phrase',
    transpose_phrase: 'transposing',
    undo_change: 'undoing a change',
    compare_with_original: 'comparing with your original',
    play_phrase: 'playing it back',
    find_similar_riffs: 'searching your riffs',
    list_riffs: 'your riff library',
    save_phrase: 'saving',
  };
  return names[toolName] ?? toolName.replace(/_/g, ' ');
}
