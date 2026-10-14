import type { NoteEvent, RiffVersion } from '../types.ts';

export const MAX_TAKE_SECONDS = 600;
export const MAX_IMPORT_BYTES = 100_000_000;
export const MAX_ARCHIVE_BYTES = 500_000_000;
export const MAX_PENDING_SECONDS = 5;
export const CHUNK_SECONDS = 1;

export interface PcmAudio { sampleRate: number; channels: Float32Array[] }
export interface AudioRegion { assetId: string; startSample: number; endSample: number }
export interface AudioAsset {
  id: string;
  source: 'microphone' | 'import' | 'legacy';
  state: 'recording' | 'complete' | 'interrupted';
  sampleRate: number;
  channelCount: number;
  sampleCount: number;
  createdAt: number;
  markers: number[];
  originalFilename?: string;
  originalMime?: string;
  originalBlob?: Blob;
  importDecode?: 'native-pcm' | 'browser-decoded';
}
export interface AudioChunk { assetId: string; index: number; startSample: number; channels: Float32Array[] }
export type TakeTarget = { riffId: string; parentId: string } | undefined;
export interface KeptTake { riffId: string; versionId: string }
export interface MigrationReport { migrated: number; missingAudio: string[]; rejected: string[]; recoveredLegacyChanges: number }
export type PlaybackSource = {kind:'audio';region:AudioRegion} | {kind:'synthesized';notes:NoteEvent[]};

export function hasUsableNotes(version: RiffVersion): boolean {
  return version.notes.length > 0 && version.notes.every(n => Number.isFinite(n.midi) && Number.isFinite(n.startMs) && n.startMs >= 0 && Number.isFinite(n.durationMs) && n.durationMs > 0);
}

export function sourceForVersion(version: RiffVersion): PlaybackSource {
  if (version.recording) return { kind:'audio', region:{...version.recording} };
  if (hasUsableNotes(version)) return {kind:'synthesized',notes:structuredClone(version.notes)};
  throw new Error('Recording unavailable. This version has no playable audio or notes.');
}
