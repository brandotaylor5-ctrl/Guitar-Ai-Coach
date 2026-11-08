/** A clear pitch preview for ear training, especially on phone speakers.
 * Low guitar fundamentals can be nearly inaudible on small speakers. A quiet
 * upper harmonic makes the pitch obvious without claiming to sound like a
 * recorded acoustic guitar. All tone scheduling is initiated by a tap.
 */
import { audioContext, audioOutput, unlockAudio } from './context.ts';
import { midiToFrequency } from '../../src/music/notes.ts';

export async function playStudyTones(midis: readonly number[], intervalMs = 530): Promise<boolean> {
  if (!midis.length) return true;
  try {
    // Must begin inside the original tap/click gesture on iOS.
    if (!await unlockAudio()) return false;
    const ctx = audioContext();
    if (ctx.state !== 'running') return false;
    const start = ctx.currentTime + 0.025;
    for (let i = 0; i < midis.length; i += 1) {
      const freq = midiToFrequency(midis[i]!);
      const at = start + i * intervalMs / 1000;
      const duration = Math.min(0.5, intervalMs / 1000 * 0.85);
      for (const part of [
        { multiplier: 1, volume: .115, wave: 'triangle' as OscillatorType },
        { multiplier: 2, volume: .105, wave: 'sine' as OscillatorType },
      ]) {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = part.wave;
        oscillator.frequency.setValueAtTime(freq * part.multiplier, at);
        gain.gain.setValueAtTime(.0001, at);
        gain.gain.linearRampToValueAtTime(part.volume, at + .018);
        gain.gain.setValueAtTime(part.volume * .82, at + .10);
        gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
        oscillator.connect(gain);
        gain.connect(audioOutput());
        oscillator.start(at);
        oscillator.stop(at + duration + .01);
      }
    }
    return true;
  } catch {
    return false;
  }
}
