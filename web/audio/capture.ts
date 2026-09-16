/**
 * Microphone in, notes and chords out.
 *
 * Three threads cooperate: an AudioWorklet collects samples on the audio
 * thread, a Worker turns them into monophonic notes, and a lightweight spectrum
 * pass on the main thread looks for stable guitar-chord shapes. The UI only sees
 * finished musical events.
 */

import type { NoteEvent } from '../../src/types.ts';
import type { Frame } from '../../src/audio/noteTracker.ts';
import type { DetectorResult } from '../detector.worker.ts';
import { ChordTracker } from './chordDetect.ts';
import type { ChordDetection } from './chordDetect.ts';

export interface CaptureHandlers {
  /** Notes that finished sounding, with the detector's clock. */
  onNotes(notes: NoteEvent[], timeMs: number): void;
  /** Every chunk of raw audio, for retention. Do not hold onto it. */
  onAudio(chunk: Float32Array): void;
  /** The latest analysis frame, for the live single-note readout. */
  onFrame(frame: Frame): void;
  /** A stable chord guess. Chord detection is intentionally conservative. */
  onChord?(chord: ChordDetection): void;
  onError(error: Error): void;
}

export class MicCapture {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private worker: Worker | null = null;
  private analyser: AnalyserNode | null = null;
  private spectrum: Float32Array | null = null;
  private chordTimer: number | null = null;
  private chordTracker = new ChordTracker();
  private readonly handlers: CaptureHandlers;
  deviceId = '';
  minRms = 0.012;

  setSensitivity(minRms: number): void {
    if (!Number.isFinite(minRms) || minRms < 0.002 || minRms > 0.1) {
      throw new Error('The noise gate must be between 0.002 and 0.1.');
    }
    this.minRms = minRms;
    this.worker?.postMessage({ type: 'sensitivity', minRms });
  }

  constructor(handlers: CaptureHandlers) {
    this.handlers = handlers;
  }

  get sampleRate(): number {
    return this.context?.sampleRate ?? 0;
  }

  get running(): boolean {
    return this.context !== null;
  }

  async start(): Promise<void> {
    if (this.context) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser will not give a page microphone access.');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(this.deviceId ? { deviceId: { exact: this.deviceId } } : {}),
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });

    const context = new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    if (context.state === 'suspended') await context.resume();

    try {
      await context.audioWorklet.addModule('./capture-worklet.js');
    } catch (err) {
      await this.stop();
      throw new Error(`Could not load the audio processor: ${(err as Error).message}`);
    }

    this.worker = new Worker(new URL('../detector.worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<DetectorResult>) => {
      const { notes, timeMs, frame } = event.data;
      this.handlers.onNotes(notes, timeMs);
      if (frame) this.handlers.onFrame(frame);
    };
    this.worker.onerror = (event) => {
      this.handlers.onError(new Error(`Pitch detection failed: ${event.message}`));
    };
    this.worker.postMessage({ type: 'init', sampleRate: context.sampleRate, minRms: this.minRms });

    const source = context.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(context, 'capture', { numberOfOutputs: 0 });
    this.node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const chunk = event.data;
      this.handlers.onAudio(chunk.slice());
      this.worker?.postMessage({ type: 'audio', chunk }, [chunk.buffer]);
    };
    source.connect(this.node);

    // Chords need the whole spectrum rather than one fundamental pitch. Keep
    // this path separate so the proven monophonic note detector stays untouched.
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 8192;
    this.analyser.smoothingTimeConstant = 0.38;
    this.analyser.minDecibels = -100;
    this.analyser.maxDecibels = -20;
    this.spectrum = new Float32Array(this.analyser.frequencyBinCount);
    source.connect(this.analyser);
    this.chordTracker.reset();
    this.chordTimer = window.setInterval(() => {
      if (!this.analyser || !this.spectrum || !this.context) return;
      this.analyser.getFloatFrequencyData(this.spectrum);
      const chord = this.chordTracker.update(
        this.spectrum,
        this.context.sampleRate,
        this.analyser.fftSize,
      );
      if (chord) this.handlers.onChord?.(chord);
    }, 120);
  }

  /** Close out any note still ringing, then tear everything down. */
  async stop(): Promise<void> {
    this.worker?.postMessage({ type: 'flush' });
    await new Promise((resolve) => setTimeout(resolve, 60));

    if (this.chordTimer !== null) window.clearInterval(this.chordTimer);
    this.chordTimer = null;
    this.analyser?.disconnect();
    this.analyser = null;
    this.spectrum = null;
    this.chordTracker.reset();

    this.node?.port.close();
    this.node?.disconnect();
    this.node = null;

    this.worker?.terminate();
    this.worker = null;

    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;

    await this.context?.close();
    this.context = null;
  }
}
