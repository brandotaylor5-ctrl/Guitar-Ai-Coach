/** A noise gate derived from a short recording of the room with strings muted. */
export function noiseGate(levels: number[]): number {
  const sorted = levels.filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  if (sorted.length < 10) throw new Error('Not enough microphone readings. Start listening and try again.');
  const noise = sorted[Math.floor((sorted.length - 1) * 0.95)]!;
  if (noise > 0.05) throw new Error('The room was too loud to calibrate. Mute the strings and try again.');
  return Math.max(0.002, Math.min(0.1, noise * 3));
}
