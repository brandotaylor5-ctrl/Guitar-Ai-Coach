/**
 * The page's half of the conversation.
 *
 * The tools run here, because this is where the player's session and library
 * are. The model call goes through the local server, because an API key in a
 * page is an API key you have given away. This posts one Messages API request
 * and returns one response; the loop around it lives in `src/converse`.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { CompletionRequest, Transport } from '../../src/converse/conversation.ts';

export interface ConversationAvailability {
  available: boolean;
  reason: string | null;
}

export async function checkAvailability(): Promise<ConversationAvailability> {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) return { available: false, reason: 'The local server is not answering.' };
    return (await response.json()) as ConversationAvailability;
  } catch {
    return {
      available: false,
      reason: 'The conversation needs the local server — open the app with npm start rather than from a file.',
    };
  }
}

export class ProxyTransport implements Transport {
  async complete(request: CompletionRequest): Promise<Anthropic.Message> {
    let response: Response;
    try {
      response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
    } catch {
      throw new Error('Could not reach the local server. Is it still running?');
    }

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      // The status is what separates "your key is wrong" from "try again".
      const detail = payload?.error ?? `The model could not be reached (${response.status}).`;
      throw new Error(
        response.status === 429
          ? `${detail} Give it a moment and ask again.`
          : detail,
      );
    }
    return payload as unknown as Anthropic.Message;
  }
}
