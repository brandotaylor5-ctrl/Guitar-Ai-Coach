/** What every view needs to reach. Passed down rather than imported globally. */

import type { Frame } from '../../src/audio/noteTracker.ts';
import type { RiffLibrary } from '../../src/library/riffLibrary.ts';
import type { SketchbookSession } from '../../src/session/session.ts';
import type { RiffPlayer } from '../audio/playback.ts';
import type { ClipStore } from '../audio/clipStore.ts';
import type { ChordDetection } from '../audio/chordDetect.ts';

export type ViewName = 'session' | 'lab' | 'library' | 'songs' | 'fingerprint';

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
  update?(): void;
  onNotes?(): void;
  /** Live single-note analysis frame. */
  onFrame?(frame: Frame): void;
  /** Stable live chord recognition. */
  onChord?(chord: ChordDetection): void;
  dispose?(): void;
}
