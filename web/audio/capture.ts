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
import { ChordTracker, explainChord } from './chordDetect.ts';
import type { ChordDetection, ChordExplanation } from './chordDetect.ts';

export interface CaptureHandlers {
  /** Notes that finished sounding, with the detector's clock. */
  onNotes(notes: NoteEvent[], timeMs: number): void;
  /** Every chunk of raw audio, for retention. Do not hold onto it. */
  onAudio(chunk: Float32Array): void;
  /** The latest analysis frame, for the live single-note readout. */
  onFrame(frame: Frame): void;
  /** A stable chord guess. Chord detection is intentionally conservative. */
  onChord?(chord: ChordDetection): void;
  /**
   * Every frame's full reasoning, when diagnostics are on.
   *
   * Off by default: it fires eight times a second and nobody playing the
   * guitar wants to look at it. On, it is the only way to find out why a
   * chord someone is definitely playing is not being named.
   */
  onChordExplain?(explanation: ChordExplanation): void;
  onError(error: Error): void;
  onInterrupted?(reason: string): void;
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
  /** Report the detector's reasoning every frame. */
  diagnostics = false;
  analysisEnabled = true;
  private epoch = 0;
  private starting: Promise<void> | null = null;
  private stopping: Promise<void> | null = null;
  private flushId = 0;
  private flushes = new Map<number, () => void>();

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

  start(): Promise<void> {
    if (this.starting) return this.starting;
    if (this.context) return Promise.resolve();
    const epoch = ++this.epoch;
    this.starting = this.open(epoch).finally(() => { this.starting = null; });
    return this.starting;
  }

  private async open(epoch: number): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser will not give a page microphone access.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(this.deviceId ? { deviceId: { exact: this.deviceId } } : {}),
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    if (epoch !== this.epoch) { for (const track of stream.getTracks()) track.stop(); return; }
    this.stream = stream;

    const context = new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    if (context.state === 'suspended') await context.resume();

    try {
      await context.audioWorklet.addModule('./capture-worklet.js');
    } catch (err) {
      await this.stop();
      throw new Error(`Could not load the audio processor: ${(err as Error).message}`);
    }
    if (epoch !== this.epoch) return;

    if (this.analysisEnabled) try {
    this.worker = new Worker(new URL('../detector.worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<DetectorResult | {type:'flushed';id:number}>) => {
      if (event.data.type === 'flushed') { this.flushes.get(event.data.id)?.(); return; }
      const { notes, timeMs, frame } = event.data;
      this.handlers.onNotes(notes, timeMs);
      if (frame) this.handlers.onFrame(frame);
    };
    this.worker.onerror = (event) => {
      this.worker?.terminate();
      this.worker = null;
      this.handlers.onError(new Error(`Pitch detection failed: ${event.message}`));
    };
    this.worker.postMessage({ type: 'init', sampleRate: context.sampleRate, minRms: this.minRms });
    } catch (error) { this.worker = null; this.handlers.onError(new Error(`Note analysis unavailable: ${String(error)}`)); }

    const source = context.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(context, 'capture', { numberOfOutputs: 0 });
    this.node.port.onmessage = (event: MessageEvent<Float32Array | {type:'flushed';id:number}>) => {
      const chunk = event.data;
      if (!(chunk instanceof Float32Array)) { this.flushes.get(chunk.id)?.(); return; }
      this.handlers.onAudio(chunk.slice());
      this.worker?.postMessage({ type: 'audio', chunk }, [chunk.buffer]);
    };
    source.connect(this.node);
    for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => {
      if (epoch === this.epoch) this.handlers.onInterrupted?.('Microphone disconnected. The captured portion is recoverable.');
    });
    context.addEventListener('statechange', () => {
      if (epoch === this.epoch && context.state === 'suspended') this.handlers.onInterrupted?.('Audio was suspended. Keep the app in the foreground while recording.');
    });
    if (!this.analysisEnabled) return;

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
      if (this.diagnostics) {
        this.handlers.onChordExplain?.(
          explainChord(this.spectrum, this.context.sampleRate, this.analyser.fftSize),
        );
      }
      const chord = this.chordTracker.update(
        this.spectrum,
        this.context.sampleRate,
        this.analyser.fftSize,
      );
      if (chord) this.handlers.onChord?.(chord);
    }, 120);
  }

  /** Close out any note still ringing, then tear everything down. */
  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    ++this.epoch;
    this.stopping = this.shutdown().finally(() => { this.stopping = null; });
    return this.stopping;
  }

  private async shutdown(): Promise<void> {
    let flushError: Error | null = null;
    if (this.node) {
      const id = ++this.flushId;
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => { this.flushes.delete(id); reject(new Error('The audio processor did not acknowledge its final samples. This take is interrupted.')); }, 1500);
          this.flushes.set(id, () => { clearTimeout(timeout); this.flushes.delete(id); resolve(); });
          this.node!.port.postMessage({ type:'flush', id });
        });
      } catch (error) { flushError = error as Error; }
    }
    if (this.worker) {
      const id = ++this.flushId;
      await new Promise<void>(resolve => {
        const timeout = setTimeout(() => { this.flushes.delete(id); resolve(); }, 1500);
        this.flushes.set(id, () => { clearTimeout(timeout); this.flushes.delete(id); resolve(); });
        this.worker!.postMessage({ type:'flush', id });
      });
    }

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
    if (flushError) throw flushError;
  }
}
