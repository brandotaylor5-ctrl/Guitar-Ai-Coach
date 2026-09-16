/** What every view needs to reach. Passed down rather than imported globally. */

import type { Frame } from '../../src/audio/noteTracker.ts';
import type { RiffLibrary } from '../../src/library/riffLibrary.ts';
import type { SketchbookSession } from '../../src/session/session.ts';
import type { RiffPlayer } from '../audio/playback.ts';
import type { ClipStore } from '../audio/clipStore.ts';

export type ViewName = 'session' | 'library' | 'songs' | 'fingerprint';

export interface AppContext {
  session: SketchbookSession;
  library: RiffLibrary;
  player: RiffPlayer;
  clips: ClipStore;
  sampleRate: number;
  listening: boolean;
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  /** Re-render whatever is on screen. */
  refresh(): void;
  navigate(view: ViewName, params?: Record<string, string>): void;
  say(message: string, kind?: 'info' | 'error'): void;
  /** Save a riff and keep its audio, so the recording survives a reload. */
  keepClipFor(audioRef: string | undefined): Promise<void>;
}

export interface View {
  element: HTMLElement;
  /** Explicit refresh, after the player changes something. */
  update?(): void;
  /**
   * Called as notes are detected. Only views that show live playing implement
   * this: rebuilding a screen the player is working in — the library, say —
   * every time a note arrives pulls the ground out from under them mid-click.
   */
  onNotes?(): void;
  /** Live audio readout, called for every analysis frame. */
  onFrame?(frame: Frame): void;
  dispose?(): void;
}
