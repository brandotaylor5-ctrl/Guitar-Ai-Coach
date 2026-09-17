/**
 * Having a conversation with one musical idea.
 *
 * The loop is written by hand rather than using the SDK's tool runner because
 * the two halves of it live in different places: the tools have to run in the
 * browser, where the player's session and library are, while the API call has
 * to happen on a server, where the key can be kept. `Transport` is the seam
 * between them — and it is also what lets the whole loop be tested against a
 * scripted model with no network at all.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, runTool } from './tools.ts';
import type { ToolContext } from './tools.ts';

/** Kept in one place so the model, the docs and the UI cannot drift apart. */
export const CONVERSATION_MODEL = 'claude-opus-5';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface CompletionRequest {
  model: string;
  max_tokens: number;
  system: string;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  output_config?: { effort?: Effort };
}

/** Whatever actually talks to the API. The browser posts to a local proxy. */
export interface Transport {
  complete(request: CompletionRequest): Promise<Anthropic.Message>;
}

export interface ConversationOptions {
  transport: Transport;
  tools: ToolContext;
  model?: string;
  /**
   * Routing a sentence to a musical tool is not a hard reasoning problem, and
   * the player is sitting there with a guitar in their hands — so this trades
   * some depth for an answer that arrives while they still care.
   */
  effort?: Effort;
  /** Guards against a loop that will not settle. */
  maxToolRounds?: number;
  /** Called as tools run, so the interface can show its working. */
  onToolUse?: (name: string, input: unknown) => void;
}

export const SYSTEM_PROMPT = `You are the musical collaborator inside Guitar AI Coach — an intelligent musical sketchbook. A guitarist is at their instrument. They have played something, and now they are talking to you about it.

WHAT THIS PRODUCT IS
The player's own playing is the curriculum. You are not a guitar teacher with a syllabus and you never steer them towards famous songs or exercises. You help them understand and develop the idea they just played. Their phrase is the centre of everything; your suggestions sit around it.

HOW TO WORK
- Look before you speak. Call look_at_phrase before answering anything about the music. Never guess at notes, keys or tempo — the tools know and you do not.
- Never invent music in your own words. If you want to change or extend the phrase, do it through a tool so the change is real and the player can hear it. Describing a change you have not made is the worst thing you can do here.
- Never tell the player they played something they did not. Use compare_with_original before saying that anything has changed.
- When they ask for something you cannot do, say so plainly and offer the nearest thing you can.

HOW TO TALK
- Plain language first, always. "The G you keep using is the note that makes this sound dark — on your low E string, that's the 3rd fret." Name the note and the fret before you name the concept.
- Only reach for theory terms — minor third, pentatonic, mixolydian — if the player asks, or after you have already said the plain version. The tools hand you both; use them in that order.
- Be brief. They are holding a guitar. Two or three sentences is usually right, and a single sentence is often better. Do not use headers or bullet lists unless you are laying out several options.
- Offer, never prescribe. When you have three endings, give them all three and let the player choose. Never say one is best. "See which you like" is the right ending to that sentence.
- Their habits are not faults. If you notice a tendency, say it as an observation, and only suggest a departure as something to try.
- Do not congratulate or flatter. Say what is there.

SAVING
Only save when they ask. If they have made a change they seem happy with, you may offer once — "want to keep this as a new version?" — and then let it go. Saving onto an existing riff adds a version and never overwrites anything, so you can say that honestly.`;

export interface ConversationTurn {
  /** What to show the player. */
  text: string;
  /** Which tools ran this turn, in order. */
  toolsUsed: string[];
  /** Set when the model stopped for a reason worth surfacing. */
  stopReason: string | null;
}

export class Conversation {
  private readonly options: Required<Pick<ConversationOptions, 'transport' | 'tools'>> & ConversationOptions;
  private messages: Anthropic.MessageParam[] = [];

  constructor(options: ConversationOptions) {
    this.options = options;
  }

  /** The transcript so far, for rendering or for starting again. */
  get history(): Anthropic.MessageParam[] {
    return this.messages;
  }

  reset(): void {
    this.messages = [];
  }

  async ask(userMessage: string): Promise<ConversationTurn> {
    this.messages.push({ role: 'user', content: userMessage });
    return this.run();
  }

  private async run(): Promise<ConversationTurn> {
    const maxRounds = this.options.maxToolRounds ?? 8;
    const toolsUsed: string[] = [];

    for (let round = 0; round <= maxRounds; round++) {
      const response = await this.options.transport.complete({
        model: this.options.model ?? CONVERSATION_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        // A snapshot, not the live array: a transport must not be able to see
        // later turns appear underneath it, or mutate the conversation.
        messages: [...this.messages],
        tools: TOOL_DEFINITIONS as unknown as Anthropic.Tool[],
        output_config: { effort: this.options.effort ?? 'medium' },
      });

      // A refusal or a truncated reply is worth saying out loud rather than
      // rendering as an empty bubble.
      if (response.stop_reason === 'refusal') {
        return { text: 'I am not able to help with that one.', toolsUsed, stopReason: 'refusal' };
      }

      this.messages.push({ role: 'assistant', content: response.content });

      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      if (toolUses.length === 0) {
        return {
          text: textOf(response),
          toolsUsed,
          stopReason: response.stop_reason === 'max_tokens' ? 'max_tokens' : null,
        };
      }

      if (round === maxRounds) {
        return {
          text: textOf(response) || 'That turned into more steps than I expected. Ask me again more specifically?',
          toolsUsed,
          stopReason: 'tool_limit',
        };
      }

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        toolsUsed.push(toolUse.name);
        this.options.onToolUse?.(toolUse.name, toolUse.input);
        const output = await runTool(toolUse.name, toolUse.input, this.options.tools);
        results.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: output,
          // A tool that failed must come back as an error, or the model will
          // treat the failure text as a successful result and narrate it.
          ...(isError(output) ? { is_error: true } : {}),
        });
      }
      // Every result goes back in one user message; splitting them teaches the
      // model to stop making parallel calls.
      this.messages.push({ role: 'user', content: results });
    }

    return { text: 'I lost the thread of that — try asking again?', toolsUsed, stopReason: 'tool_limit' };
  }
}

function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function isError(toolOutput: string): boolean {
  try {
    return typeof (JSON.parse(toolOutput) as { error?: unknown }).error === 'string';
  } catch {
    return false;
  }
}
